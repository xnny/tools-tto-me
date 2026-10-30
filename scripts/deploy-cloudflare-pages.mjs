import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { domainToASCII, fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const defaultProjectRoot = resolve(dirname(scriptPath), '..');
const defaultApiBaseUrl = 'https://api.cloudflare.com/client/v4';
const redirectPhase = 'http_request_dynamic_redirect';
const acceptedDomainStatuses = new Set(['active', 'initializing', 'pending']);
const failedDomainStatuses = new Set(['blocked', 'error']);
const deploymentStageNames = new Set([
        'queued', 'initialize', 'clone_repo', 'build', 'deploy',
]);
const deploymentStageStatuses = new Set([
        'success', 'idle', 'active', 'failure', 'canceled', 'skipped',
]);
const failedDeploymentStatuses = new Set(['failure', 'canceled', 'skipped']);
const envKeys = [
        'CLOUDFLARE_ACCOUNT_ID',
        'CLOUDFLARE_API_TOKEN',
        'CLOUDFLARE_PAGES_PROJECT_NAME',
        'CLOUDFLARE_PAGES_PRODUCTION_BRANCH',
        'CLOUDFLARE_PAGES_CUSTOM_DOMAIN',
        'CLOUDFLARE_PAGES_REDIRECT_DOMAINS',
];

export const REDIRECT_RULE_REF = 'deploy_pages_www_to_apex';

export class CloudflareApiError extends Error {
        constructor(message, { status, payload } = {}) {
                super(message);
                this.name = 'CloudflareApiError';
                this.status = status;
                this.payload = payload;
        }
}

function redactSecret(value, secret) {
        const text = String(value);
        return secret ? text.split(secret).join('[REDACTED]') : text;
}

function apiErrorDetails(payload, apiToken) {
        if (!Array.isArray(payload?.errors)) return '';

        return payload.errors
                .map((error) => {
                        const code = error?.code === undefined ? '' : `[${error.code}] `;
                        return `${code}${redactSecret(error?.message || 'Unknown Cloudflare error', apiToken)}`;
                })
                .join('; ');
}

function apiFailure(method, path, status, payload, apiToken) {
        const details = apiErrorDetails(payload, apiToken);
        return new CloudflareApiError(
                `Cloudflare API ${method} ${path} failed with HTTP ${status}${details ? `: ${details}` : ''}`,
                { status, payload },
        );
}

export function normalizeHostname(value, label = 'domain') {
        if (typeof value !== 'string' || !value.trim()) {
                throw new Error(`${label} must be a non-empty hostname.`);
        }

        let hostname = value.trim().toLowerCase();
        if (hostname.endsWith('.')) hostname = hostname.slice(0, -1);

        if (
                !hostname ||
                hostname.includes('://') ||
                /[\\/?#@:*]/.test(hostname)
        ) {
                throw new Error(`${label} must be a hostname without a protocol, port, path, or wildcard.`);
        }

        hostname = domainToASCII(hostname);
        const labels = hostname.split('.');
        const validLabels =
                hostname.length <= 253 &&
                labels.length >= 2 &&
                labels.every(
                        (part) =>
                                part.length >= 1 &&
                                part.length <= 63 &&
                                /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(part),
                );

        if (!validLabels) {
                throw new Error(`${label} is not a valid DNS hostname.`);
        }

        return hostname;
}

export function readDomainConfig(env) {
        const primaryValue = env.CLOUDFLARE_PAGES_CUSTOM_DOMAIN?.trim();
        if (!primaryValue) {
                throw new Error('Missing Cloudflare configuration: CLOUDFLARE_PAGES_CUSTOM_DOMAIN');
        }

        const primaryDomain = normalizeHostname(
                primaryValue,
                'CLOUDFLARE_PAGES_CUSTOM_DOMAIN',
        );
        if (!env.CLOUDFLARE_PAGES_REDIRECT_DOMAINS?.trim()) {
                throw new Error(
                        'Missing Cloudflare configuration: CLOUDFLARE_PAGES_REDIRECT_DOMAINS',
                );
        }

        const redirectDomains = [];
        const seen = new Set();

        for (const value of (env.CLOUDFLARE_PAGES_REDIRECT_DOMAINS || '').split(',')) {
                if (!value.trim()) continue;

                const hostname = normalizeHostname(
                        value,
                        'CLOUDFLARE_PAGES_REDIRECT_DOMAINS',
                );
                if (hostname === primaryDomain) {
                        throw new Error(
                                'CLOUDFLARE_PAGES_REDIRECT_DOMAINS must not include the primary custom domain.',
                        );
                }
                if (!hostname.endsWith(`.${primaryDomain}`)) {
                        throw new Error(
                                `Redirect domain "${hostname}" must belong to the "${primaryDomain}" zone.`,
                        );
                }
                if (!seen.has(hostname)) {
                        seen.add(hostname);
                        redirectDomains.push(hostname);
                }
        }
        if (redirectDomains.length === 0) {
                throw new Error(
                        'CLOUDFLARE_PAGES_REDIRECT_DOMAINS must include at least one hostname.',
                );
        }

        return { primaryDomain, redirectDomains };
}

function loadCloudflareEnvironment({ env, projectRoot }) {
        const environment = { ...env };
        const envFileSetting = environment.CLOUDFLARE_ENV_FILE || '.env.cloudflare';
        const envFile = isAbsolute(envFileSetting)
                ? envFileSetting
                : resolve(projectRoot, envFileSetting);

        if (existsSync(envFile)) {
                let fileEnv;
                try {
                        fileEnv = parseEnv(readFileSync(envFile, 'utf8'));
                } catch (error) {
                        throw new Error(`Unable to read ${envFileSetting}: ${error.message}`);
                }

                for (const key of envKeys) {
                        if (!environment[key]?.trim() && fileEnv[key]?.trim()) {
                                environment[key] = fileEnv[key];
                        }
                }
        }

        return { environment, envFileSetting };
}

export async function cloudflareRequest({
        path,
        apiToken,
        method = 'GET',
        body,
        allowedStatuses = [],
        fetchImpl = globalThis.fetch,
        apiBaseUrl = defaultApiBaseUrl,
        timeoutMs = 30_000,
}) {
        const headers = {
                Accept: 'application/json',
                Authorization: `Bearer ${apiToken}`,
        };
        if (body !== undefined) headers['Content-Type'] = 'application/json';

        let response;
        try {
                response = await fetchImpl(`${apiBaseUrl}${path}`, {
                        method,
                        headers,
                        body: body === undefined ? undefined : JSON.stringify(body),
                        signal: AbortSignal.timeout(timeoutMs),
                });
        } catch (error) {
                throw new CloudflareApiError(
                        `Cloudflare API ${method} ${path} could not be reached: ${redactSecret(error.message, apiToken)}`,
                );
        }

        let payload;
        try {
                payload = await response.json();
        } catch {
                throw new CloudflareApiError(
                        `Cloudflare API ${method} ${path} returned invalid JSON (HTTP ${response.status}).`,
                        { status: response.status },
                );
        }

        if (allowedStatuses.includes(response.status)) {
                return { status: response.status, payload };
        }

        if (!response.ok || payload?.success !== true) {
                throw apiFailure(method, path, response.status, payload, apiToken);
        }

        return { status: response.status, payload };
}

function domainPath(accountId, projectName, hostname) {
        return `/accounts/${encodeURIComponent(accountId)}/pages/projects/${encodeURIComponent(projectName)}/domains/${encodeURIComponent(hostname)}`;
}

function validateDomainIdentity(result, hostname) {
        if (!result || typeof result.name !== 'string' || typeof result.status !== 'string') {
                throw new Error(`Cloudflare returned an incomplete custom domain result for "${hostname}".`);
        }

        if (normalizeHostname(result.name, 'Cloudflare domain result') !== hostname) {
                throw new Error(`Cloudflare returned a different custom domain for "${hostname}".`);
        }

        return result;
}

function validateDomainResult(result, hostname) {
        validateDomainIdentity(result, hostname);

        const statuses = [
                result.status,
                result.validation_data?.status,
                result.verification_data?.status,
        ].filter(Boolean);
        const failure = statuses.find((status) => failedDomainStatuses.has(status));
        if (failure) {
                const details = [
                        result.validation_data?.error_message,
                        result.verification_data?.error_message,
                ].filter(Boolean);
                throw new Error(
                        `Custom domain "${hostname}" is ${failure}${details.length ? `: ${details.join('; ')}` : ''}.`,
                );
        }
        if (statuses.includes('deactivated')) {
                throw new Error(
                        `Custom domain "${hostname}" remains deactivated after retrying validation.`,
                );
        }

        if (!acceptedDomainStatuses.has(result.status)) {
                throw new Error(`Custom domain "${hostname}" has unsupported status "${result.status}".`);
        }

        return result;
}

function logDomainStatus(result, logger) {
        const details = [
                `status: ${result.status}`,
                result.validation_data?.status
                        ? `validation: ${result.validation_data.status}`
                        : null,
                result.verification_data?.status
                        ? `verification: ${result.verification_data.status}`
                        : null,
        ].filter(Boolean);
        logger.log(`Custom domain "${result.name}" (${details.join(', ')}).`);

        if (result.validation_data?.txt_name && result.validation_data?.txt_value) {
                logger.log(
                        `Validation TXT record: ${result.validation_data.txt_name} = ${result.validation_data.txt_value}`,
                );
        }
}

async function ensurePagesDomainAssociation({
        accountId,
        projectName,
        hostname,
        apiToken,
        fetchImpl = globalThis.fetch,
        logger = console,
        apiBaseUrl = defaultApiBaseUrl,
}) {
        const path = domainPath(accountId, projectName, hostname);
        const request = (options = {}) =>
                cloudflareRequest({
                        path,
                        apiToken,
                        fetchImpl,
                        apiBaseUrl,
                        ...options,
                });
        const getDomain = () => request({ allowedStatuses: [404] });

        let response = await getDomain();
        let result;

        if (response.status === 404) {
                logger.log(`Adding custom domain "${hostname}" to Pages project "${projectName}"...`);
                try {
                        result = (
                                await cloudflareRequest({
                                        path: `/accounts/${encodeURIComponent(accountId)}/pages/projects/${encodeURIComponent(projectName)}/domains`,
                                        apiToken,
                                        method: 'POST',
                                        body: { name: hostname },
                                        fetchImpl,
                                        apiBaseUrl,
                                })
                        ).payload.result;
                } catch (createError) {
                        response = await getDomain();
                        if (response.status === 404) throw createError;
                        result = response.payload.result;
                        logger.log(`Custom domain "${hostname}" was added concurrently; continuing.`);
                }
        } else {
                result = response.payload.result;
        }

        return validateDomainIdentity(result, hostname);
}

async function finalizePagesDomain({
        accountId,
        projectName,
        hostname,
        apiToken,
        result,
        fetchImpl = globalThis.fetch,
        logger = console,
        apiBaseUrl = defaultApiBaseUrl,
}) {
        const path = domainPath(accountId, projectName, hostname);
        const request = (options = {}) =>
                cloudflareRequest({
                        path,
                        apiToken,
                        fetchImpl,
                        apiBaseUrl,
                        ...options,
                });
        if (result === undefined) {
                result = (await request()).payload.result;
        }
        result = validateDomainIdentity(result, hostname);
        const statuses = [
                result?.status,
                result?.validation_data?.status,
                result?.verification_data?.status,
        ];
        if (statuses.includes('deactivated')) {
                logger.log(`Retrying validation for deactivated custom domain "${hostname}"...`);
                result = (await request({ method: 'PATCH' })).payload.result;
        }

        result = validateDomainResult(result, hostname);
        logDomainStatus(result, logger);
        return result;
}

export async function ensurePagesDomain(options) {
        const result = await ensurePagesDomainAssociation(options);
        return finalizePagesDomain({ ...options, result });
}

function buildPagesDnsRecord(hostname, projectName) {
        const normalizedHostname = normalizeHostname(hostname, 'DNS hostname');
        const project = projectName?.trim().toLowerCase();
        if (!project) {
                throw new Error('Cloudflare Pages project name must not be empty.');
        }

        return {
                type: 'CNAME',
                name: normalizedHostname,
                content: normalizeHostname(`${project}.pages.dev`, 'Pages DNS target'),
                proxied: true,
                ttl: 1,
        };
}

function dnsConflict(hostname, records, reason) {
        const details = records
                .map((record) => {
                        const type = typeof record?.type === 'string' ? record.type : 'unknown';
                        const content = typeof record?.content === 'string' ? record.content : 'unknown';
                        return `${type} ${content}`;
                })
                .join(', ');
        return new Error(
                `DNS conflict for "${hostname}": ${reason}${details ? ` (${details})` : ''}. Refusing to overwrite existing records.`,
        );
}

function inspectDnsRecords(records, desired) {
        if (!Array.isArray(records)) {
                throw new Error(`Cloudflare returned an invalid DNS record list for "${desired.name}".`);
        }

        for (const record of records) {
                if (
                        !record ||
                        typeof record.name !== 'string' ||
                        normalizeHostname(record.name, 'Cloudflare DNS record') !== desired.name
                ) {
                        throw new Error(`Cloudflare returned a different DNS hostname for "${desired.name}".`);
                }
        }

        const routingTypes = new Set(['A', 'AAAA', 'CNAME', 'NS']);
        const routingRecords = records.filter((record) =>
                routingTypes.has(String(record.type).toUpperCase()),
        );
        if (routingRecords.length === 0) return { state: 'missing' };
        if (routingRecords.length !== 1) {
                throw dnsConflict(desired.name, routingRecords, 'multiple routing records exist');
        }

        const record = routingRecords[0];
        if (String(record.type).toUpperCase() !== 'CNAME') {
                throw dnsConflict(desired.name, routingRecords, 'an incompatible routing record exists');
        }

        let content;
        try {
                content = normalizeHostname(record.content, 'Cloudflare DNS target');
        } catch {
                throw dnsConflict(desired.name, routingRecords, 'the existing CNAME target is invalid');
        }
        if (content !== desired.content) {
                throw dnsConflict(
                        desired.name,
                        routingRecords,
                        `the existing CNAME does not point to "${desired.content}"`,
                );
        }
        if (typeof record.id !== 'string' || !record.id) {
                throw new Error(`Cloudflare DNS record "${desired.name}" is missing its record ID.`);
        }

        if (record.proxied === true && record.ttl === 1) {
                return { state: 'ready', record };
        }

        return { state: 'drifted', record };
}

export async function ensureDnsRecord({
        zoneId,
        hostname,
        projectName,
        apiToken,
        fetchImpl = globalThis.fetch,
        logger = console,
        apiBaseUrl = defaultApiBaseUrl,
}) {
        const desired = buildPagesDnsRecord(hostname, projectName);
        const recordsPath = `/zones/${encodeURIComponent(zoneId)}/dns_records`;
        const query = new URLSearchParams({
                'name.exact': desired.name,
                per_page: '100',
        });
        const request = (path, options = {}) =>
                cloudflareRequest({
                        path,
                        apiToken,
                        fetchImpl,
                        apiBaseUrl,
                        ...options,
                });
        const getRecords = async () => {
                const { payload } = await request(`${recordsPath}?${query}`);
                if (payload?.result_info?.total_pages > 1) {
                        throw new Error(
                                `Cloudflare returned more than 100 DNS records for "${desired.name}"; refusing an incomplete lookup.`,
                        );
                }
                return payload.result;
        };
        const validateMutation = (result) => {
                const inspection = inspectDnsRecords([result], desired);
                if (inspection.state !== 'ready') {
                        throw new Error(`DNS record "${desired.name}" did not converge.`);
                }
                return inspection.record;
        };
        const recoverConcurrentMutation = async (mutationError) => {
                const inspection = inspectDnsRecords(await getRecords(), desired);
                if (inspection.state !== 'ready') throw mutationError;
                logger.log(`DNS record "${desired.name}" converged concurrently.`);
                return inspection.record;
        };

        const current = inspectDnsRecords(await getRecords(), desired);
        if (current.state === 'ready') {
                logger.log(
                        `DNS record "${desired.name}" already points to "${desired.content}" (proxied).`,
                );
                return current.record;
        }

        if (current.state === 'missing') {
                logger.log(
                        `Adding proxied CNAME "${desired.name}" -> "${desired.content}"...`,
                );
                let response;
                try {
                        response = await request(recordsPath, {
                                method: 'POST',
                                body: desired,
                        });
                } catch (error) {
                        return recoverConcurrentMutation(error);
                }
                const record = validateMutation(response.payload.result);
                logger.log(`DNS record "${desired.name}" is configured.`);
                return record;
        }

        logger.log(`Updating proxy and TTL for Pages CNAME "${desired.name}"...`);
        let response;
        try {
                response = await request(
                        `${recordsPath}/${encodeURIComponent(current.record.id)}`,
                        {
                                method: 'PATCH',
                                body: desired,
                        },
                );
        } catch (error) {
                return recoverConcurrentMutation(error);
        }
        const record = validateMutation(response.payload.result);
        logger.log(`DNS record "${desired.name}" is configured.`);
        return record;
}

export function buildRedirectRule(primaryDomain, redirectDomains) {
        const normalizedPrimary = normalizeHostname(primaryDomain, 'primary domain');
        const normalizedRedirects = [
                ...new Set(
                        redirectDomains.map((domain) => normalizeHostname(domain, 'redirect domain')),
                ),
        ];
        if (normalizedRedirects.length === 0) {
                throw new Error('At least one redirect domain is required.');
        }
        for (const hostname of normalizedRedirects) {
                if (
                        hostname === normalizedPrimary ||
                        !hostname.endsWith(`.${normalizedPrimary}`)
                ) {
                        throw new Error(
                                `Redirect domain "${hostname}" must be a subdomain of "${normalizedPrimary}".`,
                        );
                }
        }

        const hostExpression =
                normalizedRedirects.length === 1
                        ? `http.host eq "${normalizedRedirects[0]}"`
                        : `http.host in {${normalizedRedirects.map((domain) => `"${domain}"`).join(' ')}}`;

        return {
                ref: REDIRECT_RULE_REF,
                description: 'Managed by deploy-cloudflare-pages.mjs: redirect aliases to the primary domain',
                enabled: true,
                expression: `(${hostExpression}) and not starts_with(http.request.uri.path, "/.well-known/")`,
                action: 'redirect',
                action_parameters: {
                        from_value: {
                                target_url: {
                                        expression: `concat("https://${normalizedPrimary}", http.request.uri.path)`,
                                },
                                status_code: 301,
                                preserve_query_string: true,
                        },
                },
        };
}

function managedRuleDefinition(rule) {
        return {
                ref: rule?.ref,
                description: rule?.description,
                enabled: rule?.enabled,
                expression: rule?.expression,
                action: rule?.action,
                action_parameters: {
                        from_value: {
                                target_url: {
                                        expression:
                                                rule?.action_parameters?.from_value?.target_url?.expression,
                                },
                                status_code: rule?.action_parameters?.from_value?.status_code,
                                preserve_query_string:
                                        rule?.action_parameters?.from_value?.preserve_query_string,
                        },
                },
        };
}

function rulesMatch(actual, desired) {
        return (
                JSON.stringify(managedRuleDefinition(actual)) ===
                JSON.stringify(managedRuleDefinition(desired))
        );
}

function entrypointMissing(response) {
        return response.status === 404;
}

function validateEntrypoint(result) {
        if (
                !result ||
                typeof result.id !== 'string' ||
                result.kind !== 'zone' ||
                result.phase !== redirectPhase ||
                !Array.isArray(result.rules)
        ) {
                throw new Error('Cloudflare returned an invalid dynamic redirect entrypoint ruleset.');
        }
        return result;
}

function findManagedRule(rules) {
        const matches = rules.filter((rule) => rule?.ref === REDIRECT_RULE_REF);
        if (matches.length > 1) {
                throw new Error(`Cloudflare has multiple redirect rules with ref "${REDIRECT_RULE_REF}".`);
        }
        return matches[0];
}

export async function ensureRedirectRule({
        zoneId,
        primaryDomain,
        redirectDomains,
        apiToken,
        fetchImpl = globalThis.fetch,
        logger = console,
        apiBaseUrl = defaultApiBaseUrl,
}) {
        const desiredRule = buildRedirectRule(primaryDomain, redirectDomains);
        const encodedZoneId = encodeURIComponent(zoneId);
        const entrypointPath = `/zones/${encodedZoneId}/rulesets/phases/${redirectPhase}/entrypoint`;
        const request = (path, options = {}) =>
                cloudflareRequest({
                        path,
                        apiToken,
                        fetchImpl,
                        apiBaseUrl,
                        ...options,
                });
        const getEntrypoint = async () => {
                const response = await request(entrypointPath, { allowedStatuses: [404] });
                if (response.status !== 404) return validateEntrypoint(response.payload.result);
                if (entrypointMissing(response)) return null;
                throw apiFailure('GET', entrypointPath, response.status, response.payload, apiToken);
        };
        const verify = async () => {
                const entrypoint = await getEntrypoint();
                if (!entrypoint) throw new Error('Dynamic redirect entrypoint was not created.');
                const rule = findManagedRule(entrypoint.rules);
                if (!rule || !rulesMatch(rule, desiredRule)) {
                        throw new Error(`Redirect rule "${REDIRECT_RULE_REF}" did not converge.`);
                }
                return rule;
        };

        let entrypoint = await getEntrypoint();
        if (!entrypoint) {
                logger.log('Creating the Cloudflare dynamic redirect entrypoint...');
                try {
                        await request(`/zones/${encodedZoneId}/rulesets`, {
                                method: 'POST',
                                body: {
                                        name: 'Pages canonical host redirects',
                                        kind: 'zone',
                                        phase: redirectPhase,
                                        rules: [desiredRule],
                                },
                        });
                        const rule = await verify();
                        logger.log(`Redirect rule "${REDIRECT_RULE_REF}" is configured.`);
                        return rule;
                } catch (createError) {
                        entrypoint = await getEntrypoint();
                        if (!entrypoint) throw createError;
                }
        }

        const currentRule = findManagedRule(entrypoint.rules);
        if (currentRule && rulesMatch(currentRule, desiredRule)) {
                logger.log(`Redirect rule "${REDIRECT_RULE_REF}" is already configured.`);
                return currentRule;
        }

        const rulesPath = `/zones/${encodedZoneId}/rulesets/${encodeURIComponent(entrypoint.id)}/rules`;
        let mutation;
        if (!currentRule) {
                logger.log(`Adding redirect rule "${REDIRECT_RULE_REF}"...`);
                mutation = () =>
                        request(rulesPath, { method: 'POST', body: desiredRule });
        } else {
                if (typeof currentRule.id !== 'string') {
                        throw new Error(`Redirect rule "${REDIRECT_RULE_REF}" is missing its Cloudflare rule ID.`);
                }
                logger.log(`Updating redirect rule "${REDIRECT_RULE_REF}"...`);
                mutation = () =>
                        request(`${rulesPath}/${encodeURIComponent(currentRule.id)}`, {
                                method: 'PATCH',
                                body: desiredRule,
                        });
        }

        try {
                await mutation();
        } catch (mutationError) {
                try {
                        const rule = await verify();
                        logger.log(`Redirect rule "${REDIRECT_RULE_REF}" converged concurrently.`);
                        return rule;
                } catch {
                        throw mutationError;
                }
        }

        const rule = await verify();
        logger.log(`Redirect rule "${REDIRECT_RULE_REF}" is configured.`);
        return rule;
}

export async function findZone({
        accountId,
        hostname,
        apiToken,
        fetchImpl = globalThis.fetch,
        apiBaseUrl = defaultApiBaseUrl,
}) {
        const query = new URLSearchParams({
                name: hostname,
                'account.id': accountId,
                status: 'active',
        });
        const { payload } = await cloudflareRequest({
                path: `/zones?${query}`,
                apiToken,
                fetchImpl,
                apiBaseUrl,
        });

        if (!Array.isArray(payload.result) || payload.result.length !== 1) {
                throw new Error(`Expected one active Cloudflare zone for "${hostname}".`);
        }

        const zone = payload.result[0];
        if (
                typeof zone?.id !== 'string' ||
                normalizeHostname(zone.name, 'Cloudflare zone') !== hostname ||
                zone.status !== 'active' ||
                zone.type !== 'full'
        ) {
                throw new Error(`Cloudflare zone "${hostname}" must be active and use full setup.`);
        }

        return zone;
}

export async function purgeCustomDomainCache({
        zoneId,
        hostnames,
        apiToken,
        fetchImpl = globalThis.fetch,
        logger = console,
        apiBaseUrl = defaultApiBaseUrl,
}) {
        const hosts = [...new Set(hostnames.map((hostname) => normalizeHostname(hostname)))];
        if (hosts.length === 0) {
                throw new Error('At least one custom domain is required for cache purging.');
        }

        // Cloudflare accepts up to 100 hostnames per purge request.
        for (let offset = 0; offset < hosts.length; offset += 100) {
                const batch = hosts.slice(offset, offset + 100);
                logger.log(`Requesting Cloudflare cache purge for ${batch.join(', ')}...`);
                try {
                        await cloudflareRequest({
                                path: `/zones/${encodeURIComponent(zoneId)}/purge_cache`,
                                apiToken,
                                method: 'POST',
                                body: { hosts: batch },
                                fetchImpl,
                                apiBaseUrl,
                        });
                } catch (error) {
                        if (error instanceof CloudflareApiError && error.status === 403) {
                                throw new Error(
                                        `${error.message} Ensure CLOUDFLARE_API_TOKEN has the zone-level Cache Purge permission for this zone.`,
                                        { cause: error },
                                );
                        }
                        throw error;
                }
                logger.log(`Cloudflare cache purge accepted for ${batch.join(', ')}.`);
        }
}

function pagesProjectPath(accountId, projectName) {
        return `/accounts/${encodeURIComponent(accountId)}/pages/projects/${encodeURIComponent(projectName)}`;
}

function isDeploymentId(value) {
        // URL encoding leaves dot segments intact, allowing them to change the API path.
        return typeof value === 'string' && Boolean(value.trim()) && value === value.trim() &&
                value !== '.' && value !== '..';
}

function validateDeployment(result) {
        if (
                !isDeploymentId(result?.id) ||
                !['production', 'preview'].includes(result.environment) ||
                !deploymentStageNames.has(result.latest_stage?.name) ||
                !deploymentStageStatuses.has(result.latest_stage?.status)
        ) {
                throw new Error('Cloudflare returned an incomplete or invalid Pages deployment.');
        }
        return result;
}

function validateSuccessfulProductionDeployment(result) {
        validateDeployment(result);
        if (
                result.environment !== 'production' ||
                result.latest_stage.name !== 'deploy' ||
                result.latest_stage.status !== 'success'
        ) {
                throw new Error(`Pages deployment "${result.id}" is not a successful production deployment.`);
        }
        return result;
}

async function snapshotProductionDeployments({ accountId, projectName, apiToken, fetchImpl }) {
        const deploymentsPath = `${pagesProjectPath(accountId, projectName)}/deployments`;
        const deployments = new Map();
        const perPage = 25;
        for (let page = 1; ; page += 1) {
                const query = new URLSearchParams({
                        env: 'production',
                        page: String(page),
                        per_page: String(perPage),
                });
                const { payload } = await cloudflareRequest({
                        path: `${deploymentsPath}?${query}`,
                        apiToken,
                        fetchImpl,
                });
                if (!Array.isArray(payload.result)) {
                        throw new Error('Cloudflare returned an invalid production deployment list.');
                }

                const info = payload.result_info;
                if (
                        (info !== undefined && (!info || typeof info !== 'object' || Array.isArray(info))) ||
                        (info?.page !== undefined && info.page !== page) ||
                        (info?.per_page !== undefined &&
                                (!Number.isInteger(info.per_page) || info.per_page < 1)) ||
                        (info?.total_pages !== undefined &&
                                (!Number.isInteger(info.total_pages) || info.total_pages < 0)) ||
                        (info?.count !== undefined &&
                                (!Number.isInteger(info.count) || info.count !== payload.result.length)) ||
                        (info?.total_count !== undefined &&
                                (!Number.isInteger(info.total_count) || info.total_count < 0))
                ) {
                        throw new Error('Cloudflare returned invalid production deployment pagination.');
                }
                const pageSize = info?.per_page ?? perPage;
                const totalPages = info?.total_pages;
                if (
                        payload.result.length > pageSize ||
                        (totalPages !== undefined && totalPages < page &&
                                !(page === 1 && totalPages === 0 && payload.result.length === 0)) ||
                        (totalPages > page && payload.result.length === 0)
                ) {
                        throw new Error('Cloudflare returned an incomplete production deployment page.');
                }

                const previousSize = deployments.size;
                for (const result of payload.result) {
                        const deployment = validateDeployment(result);
                        if (
                                deployment.environment !== 'production' ||
                                (deployment.project_name !== undefined && deployment.project_name !== projectName)
                        ) {
                                throw new Error('Cloudflare returned a deployment outside the requested production project.');
                        }
                        const previous = deployments.get(deployment.id);
                        if (
                                previous && (
                                        previous.latest_stage.name !== deployment.latest_stage.name ||
                                        previous.latest_stage.status !== deployment.latest_stage.status
                                )
                        ) {
                                throw new Error(
                                        `Cloudflare returned conflicting results for Pages deployment "${deployment.id}".`,
                                );
                        }
                        deployments.set(deployment.id, deployment);
                }
                if (page > 1 && payload.result.length > 0 && deployments.size === previousSize) {
                        throw new Error(
                                'Cloudflare repeated a production deployment page; refusing an incomplete snapshot.',
                        );
                }
                if (info?.total_count !== undefined && info.total_count < deployments.size) {
                        throw new Error('Cloudflare returned an inconsistent production deployment count.');
                }
                if (totalPages !== undefined ? page >= totalPages : payload.result.length < pageSize) break;
        }

        // A successful build or initialization stage can still be followed by deployment.
        return [...deployments.values()].filter(
                (deployment) =>
                        (deployment.latest_stage.name === 'deploy' && deployment.latest_stage.status === 'success') ||
                        failedDeploymentStatuses.has(deployment.latest_stage.status),
        );
}

function readWranglerDeployment(outputFilePath, projectName) {
        let records;
        try {
                records = readFileSync(outputFilePath, 'utf8')
                        .split(/\r?\n/)
                        .filter((line) => line.trim())
                        .map((line) => JSON.parse(line));
        } catch (error) {
                throw new Error('Unable to read Wrangler structured deployment output.', { cause: error });
        }
        const deployments = records.filter((record) => record?.type === 'pages-deploy-detailed');
        const deployment = deployments[0];
        if (
                deployments.length !== 1 ||
                deployment.version !== 1 ||
                deployment.pages_project !== projectName ||
                !isDeploymentId(deployment.deployment_id) ||
                !['production', 'preview'].includes(deployment.environment)
        ) {
                throw new Error('Wrangler returned incomplete or ambiguous structured deployment output.');
        }
        return { id: deployment.deployment_id, environment: deployment.environment };
}

async function verifyUploadedProductionDeployment({
        accountId,
        projectName,
        apiToken,
        fetchImpl,
        deployment,
}) {
        const deploymentsPath = `${pagesProjectPath(accountId, projectName)}/deployments`;
        const uploaded = validateSuccessfulProductionDeployment(
                (await cloudflareRequest({
                        path: `${deploymentsPath}/${encodeURIComponent(deployment.id)}`,
                        apiToken,
                        fetchImpl,
                })).payload.result,
        );
        if (uploaded.id !== deployment.id || uploaded.project_name !== projectName) {
                throw new Error('Cloudflare returned a different deployment than the one Wrangler uploaded.');
        }
}

async function cleanupProductionDeployments({
        accountId,
        projectName,
        apiToken,
        fetchImpl,
        logger,
        deployment,
        previousDeployments,
}) {
        if (deployment.environment === 'preview') {
                logger.log(`Skipping production deployment cleanup for preview deployment "${deployment.id}".`);
                return;
        }
        const projectPath = pagesProjectPath(accountId, projectName);
        const deploymentsPath = `${projectPath}/deployments`;
        const request = (path, options = {}) =>
                cloudflareRequest({ path, apiToken, fetchImpl, ...options });
        const project = (await request(projectPath)).payload.result;
        if (project?.name !== projectName) {
                throw new Error('Cloudflare returned an incomplete or different Pages project.');
        }
        const canonical = validateSuccessfulProductionDeployment(project.canonical_deployment);
        if (canonical.project_name !== undefined && canonical.project_name !== projectName) {
                throw new Error('Cloudflare returned a canonical deployment for a different Pages project.');
        }
        const preservedIds = new Set([deployment.id, canonical.id]);
        let deletedCount = 0;
        let alreadyRemovedCount = 0;
        for (const previous of previousDeployments) {
                if (preservedIds.has(previous.id)) continue;
                let status;
                try {
                        ({ status } = await request(`${deploymentsPath}/${encodeURIComponent(previous.id)}`, {
                                method: 'DELETE',
                                allowedStatuses: [404],
                        }));
                } catch (error) {
                        // A deployment removed concurrently may return a 404 without a JSON body.
                        if (!(error instanceof CloudflareApiError) || error.status !== 404) throw error;
                        status = 404;
                }
                if (status === 404) {
                        alreadyRemovedCount += 1;
                        logger.log(`Old production deployment "${previous.id}" was already removed.`);
                } else {
                        deletedCount += 1;
                        logger.log(`Deleted old production deployment "${previous.id}".`);
                }
        }
        logger.log(
                `Old production deployment cleanup complete: ${deletedCount} deleted, ${alreadyRemovedCount} already removed.`,
        );
}

export function runWranglerCommand(
        args,
        {
                captureOutput = false,
                outputFilePath,
                env = process.env,
                projectRoot = defaultProjectRoot,
        } = {},
) {
        const wranglerScript = resolve(
                projectRoot,
                'node_modules',
                'wrangler',
                'bin',
                'wrangler.js',
        );
        const result = spawnSync(process.execPath, [wranglerScript, ...args], {
                cwd: projectRoot,
                encoding: 'utf8',
                env: outputFilePath ? { ...env, WRANGLER_OUTPUT_FILE_PATH: outputFilePath } : env,
                stdio: captureOutput ? ['ignore', 'pipe', 'inherit'] : 'inherit',
        });

        if (result.error) {
                throw new Error(`Unable to run Wrangler: ${result.error.message}`);
        }
        if (result.status !== 0) {
                throw new Error(`Wrangler exited with status ${result.status ?? 1}.`);
        }

        return result.stdout || '';
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   fetchImpl?: typeof globalThis.fetch,
 *   runWrangler?: (args: string[], captureOutput?: boolean, options?: { outputFilePath?: string }) => string | Promise<string>,
 *   logger?: Pick<Console, 'log'>,
 *   projectRoot?: string,
 * }} [options]
 */
export async function main({
        env = process.env,
        fetchImpl = globalThis.fetch,
        runWrangler,
        logger = console,
        projectRoot = defaultProjectRoot,
} = {}) {
        const { environment, envFileSetting } = loadCloudflareEnvironment({
                env,
                projectRoot,
        });
        const requiredKeys = [
                'CLOUDFLARE_ACCOUNT_ID',
                'CLOUDFLARE_API_TOKEN',
                'CLOUDFLARE_PAGES_CUSTOM_DOMAIN',
                'CLOUDFLARE_PAGES_REDIRECT_DOMAINS',
        ];
        const missingKeys = requiredKeys.filter((key) => !environment[key]?.trim());
        if (missingKeys.length > 0) {
                throw new Error(
                        [
                                `Missing Cloudflare configuration: ${missingKeys.join(', ')}`,
                                `Copy .env.cloudflare.example to ${envFileSetting} and fill in the values.`,
                                'Do not commit the credentials file.',
                        ].join('\n'),
                );
        }

        const accountId = environment.CLOUDFLARE_ACCOUNT_ID.trim();
        const apiToken = environment.CLOUDFLARE_API_TOKEN.trim();
        const projectName =
                environment.CLOUDFLARE_PAGES_PROJECT_NAME?.trim() || 'tools-tto';
        const productionBranch =
                environment.CLOUDFLARE_PAGES_PRODUCTION_BRANCH?.trim() || 'main';
        const { primaryDomain, redirectDomains } = readDomainConfig(environment);
        const hostnames = [primaryDomain, ...redirectDomains];
        const invokeWrangler =
                runWrangler ||
                ((args, captureOutput = false, { outputFilePath } = {}) =>
                        runWranglerCommand(args, {
                                captureOutput,
                                outputFilePath,
                                env: environment,
                                projectRoot,
                        }));

        logger.log(`Checking Cloudflare Pages project "${projectName}"...`);
        let projects;
        try {
                projects = JSON.parse(
                        await invokeWrangler(['pages', 'project', 'list', '--json'], true),
                );
        } catch (error) {
                throw new Error(`Unable to read the Cloudflare Pages project list: ${error.message}`);
        }

        if (!Array.isArray(projects)) {
                throw new Error('Wrangler returned an unexpected Pages project list.');
        }

        const projectExists = projects.some(
                (project) =>
                        project?.['Project Name'] === projectName || project?.name === projectName,
        );
        if (!projectExists) {
                logger.log(
                        `Creating Cloudflare Pages project "${projectName}" with production branch "${productionBranch}"...`,
                );
                await invokeWrangler([
                        'pages',
                        'project',
                        'create',
                        projectName,
                        '--production-branch',
                        productionBranch,
                ]);
        }

        let previousDeployments;
        try {
                previousDeployments = await snapshotProductionDeployments({
                        accountId,
                        projectName,
                        apiToken,
                        fetchImpl,
                });
        } catch (error) {
                throw new Error(
                        `Old production deployment cleanup preparation is incomplete; deployment was not started: ${redactSecret(error.message, apiToken)}`,
                        { cause: error },
                );
        }

        const outputDirectory = mkdtempSync(resolve(tmpdir(), 'cloudflare-pages-deploy-'));
        const outputFilePath = resolve(outputDirectory, 'wrangler-output.jsonl');
        let deployment;
        try {
                logger.log(`Deploying dist/ to Cloudflare Pages project "${projectName}"...`);
                await invokeWrangler(
                        ['pages', 'deploy', 'dist', '--project-name', projectName],
                        false,
                        { outputFilePath },
                );
                try {
                        deployment = readWranglerDeployment(outputFilePath, projectName);
                } catch (error) {
                        throw new Error(
                                `Pages deployment succeeded, but old production deployment cleanup is incomplete: ${redactSecret(error.message, apiToken)}`,
                                { cause: error },
                        );
                }
        } finally {
                rmSync(outputDirectory, { recursive: true, force: true });
        }

        let configuration;
        let zone;
        try {
                for (const hostname of hostnames) {
                        await ensurePagesDomainAssociation({
                                accountId,
                                projectName,
                                hostname,
                                apiToken,
                                fetchImpl,
                                logger,
                        });
                }

                zone = await findZone({
                        accountId,
                        hostname: primaryDomain,
                        apiToken,
                        fetchImpl,
                });
                const dnsRecords = [];
                for (const hostname of hostnames) {
                        dnsRecords.push(
                                await ensureDnsRecord({
                                        zoneId: zone.id,
                                        hostname,
                                        projectName,
                                        apiToken,
                                        fetchImpl,
                                        logger,
                                }),
                        );
                }

                const domains = [];
                for (const hostname of hostnames) {
                        domains.push(
                                await finalizePagesDomain({
                                        accountId,
                                        projectName,
                                        hostname,
                                        apiToken,
                                        fetchImpl,
                                        logger,
                                }),
                        );
                }

                let redirectRule = null;
                if (redirectDomains.length > 0) {
                        redirectRule = await ensureRedirectRule({
                                zoneId: zone.id,
                                primaryDomain,
                                redirectDomains,
                                apiToken,
                                fetchImpl,
                                logger,
                        });
                }

                configuration = { projectName, domains, dnsRecords, redirectRule };
        } catch (error) {
                throw new Error(
                        `Pages deployment succeeded, but Cloudflare domain configuration is incomplete: ${redactSecret(error.message, apiToken)}`,
                        { cause: error },
                );
        }

        if (deployment.environment === 'production') {
                try {
                        await verifyUploadedProductionDeployment({
                                accountId,
                                projectName,
                                apiToken,
                                fetchImpl,
                                deployment,
                        });
                        await purgeCustomDomainCache({
                                zoneId: zone.id,
                                hostnames,
                                apiToken,
                                fetchImpl,
                                logger,
                        });
                } catch (error) {
                        throw new Error(
                                `Pages deployment succeeded, but custom domain cache purge is incomplete: ${redactSecret(error.message, apiToken)}`,
                                { cause: error },
                        );
                }
        } else {
                logger.log(`Skipping custom domain cache purge for preview deployment "${deployment.id}".`);
        }

        try {
                await cleanupProductionDeployments({
                        accountId,
                        projectName,
                        apiToken,
                        fetchImpl,
                        logger,
                        deployment,
                        previousDeployments,
                });
        } catch (error) {
                throw new Error(
                        `Pages deployment succeeded, but old production deployment cleanup is incomplete: ${redactSecret(error.message, apiToken)}`,
                        { cause: error },
                );
        }
        return configuration;
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
        main().catch((error) => {
                console.error(error.message);
                process.exitCode = 1;
        });
}
