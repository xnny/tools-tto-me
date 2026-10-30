import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { findZone, main, readDomainConfig } from './deploy-cloudflare-pages.mjs';

function zoneLookup(results, queries) {
        return async (url) => {
                const parsed = new URL(url);
                assert.equal(parsed.pathname, '/client/v4/zones');
                assert.equal(parsed.searchParams.get('account.id'), 'account');
                const name = parsed.searchParams.get('name');
                queries.push(name);
                return {
                        ok: true,
                        status: 200,
                        json: async () => ({ success: true, result: results[name] ?? [] }),
                };
        };
}

test('findZone resolves a subdomain to its parent zone', async () => {
        const queries = [];
        const zone = { id: 'parent', name: 'example.com', status: 'active', type: 'full' };
        const result = await findZone({
                accountId: 'account', apiToken: 'token', hostname: 'tools.example.com',
                fetchImpl: zoneLookup({ 'example.com': [zone] }, queries),
        });
        assert.deepEqual(result, zone);
        assert.deepEqual(queries, ['tools.example.com', 'example.com']);
});

test('findZone prefers the closest matching zone', async () => {
        const queries = [];
        const zone = { id: 'nearest', name: 'sub.example.com', status: 'active', type: 'full' };
        const result = await findZone({
                accountId: 'account', apiToken: 'token', hostname: 'tools.sub.example.com',
                fetchImpl: zoneLookup({
                        'sub.example.com': [zone],
                        'example.com': [{ id: 'parent', name: 'example.com', status: 'active', type: 'full' }],
                }, queries),
        });
        assert.deepEqual(result, zone);
        assert.deepEqual(queries, ['tools.sub.example.com', 'sub.example.com']);
});

test('findZone rejects missing or invalid zone results', async () => {
        const options = { accountId: 'account', apiToken: 'token', hostname: 'tools.example.com' };
        await assert.rejects(findZone({ ...options, fetchImpl: zoneLookup({}, []) }), /zone/i);
        for (const result of [
                'invalid',
                [{ id: 'zone', name: 'unrelated.com', status: 'active', type: 'full' }],
                [{ id: 'zone', name: 'tools.example.com', status: 'pending', type: 'full' }],
                [{ id: 'zone', name: 'tools.example.com', status: 'active', type: 'partial' }],
                [
                        { id: 'zone1', name: 'tools.example.com', status: 'active', type: 'full' },
                        { id: 'zone2', name: 'tools.example.com', status: 'active', type: 'full' },
                ],
        ]) {
                await assert.rejects(findZone({
                        ...options,
                        fetchImpl: zoneLookup({ 'tools.example.com': result }, []),
                }), /zone/i);
        }
});

test('empty or omitted redirect domains are optional', () => {
        for (const value of [undefined, '', '  ']) {
                assert.deepEqual(
                        readDomainConfig({
                                CLOUDFLARE_PAGES_CUSTOM_DOMAIN: 'Example.com',
                                CLOUDFLARE_PAGES_REDIRECT_DOMAINS: value,
                        }),
                        { primaryDomain: 'example.com', redirectDomains: [] },
                );
        }
        assert.throws(
                () => readDomainConfig({
                        CLOUDFLARE_PAGES_CUSTOM_DOMAIN: 'example.com',
                        CLOUDFLARE_PAGES_REDIRECT_DOMAINS: 'other.com',
                }),
                /must belong to/,
        );
        assert.deepEqual(
                readDomainConfig({
                        CLOUDFLARE_PAGES_CUSTOM_DOMAIN: 'example.com',
                        CLOUDFLARE_PAGES_REDIRECT_DOMAINS: 'WWW.example.com, www.example.com',
                }).redirectDomains,
                ['www.example.com'],
        );
});

test('deployment with no redirect domains only configures the primary domain', async () => {
        const projectRoot = mkdtempSync(join(tmpdir(), 'pages-test-'));
        // An explicitly empty process value must override a non-empty file value.
        writeFileSync(join(projectRoot, '.env.cloudflare'), 'CLOUDFLARE_PAGES_REDIRECT_DOMAINS=www.example.com\n');
        const requests = [];
        const environment = {
                CLOUDFLARE_ACCOUNT_ID: 'account',
                CLOUDFLARE_API_TOKEN: 'token',
                CLOUDFLARE_PAGES_PROJECT_NAME: 'project',
                CLOUDFLARE_PAGES_CUSTOM_DOMAIN: 'example.com',
                CLOUDFLARE_PAGES_REDIRECT_DOMAINS: '',
        };
        const domain = { name: 'example.com', status: 'active' };
        const dns = {
                id: 'record', name: 'example.com', type: 'CNAME',
                content: 'project.pages.dev', proxied: true, ttl: 1,
        };
        const deployment = {
                id: 'deployment', project_name: 'project', environment: 'production',
                latest_stage: { name: 'deploy', status: 'success' },
        };
        const fetchImpl = async (url, options) => {
                const parsed = new URL(url);
                requests.push({ path: parsed.pathname, query: parsed.searchParams, method: options.method, body: options.body });
                let result;
                if (parsed.pathname.endsWith('/deployments')) result = [];
                else if (parsed.pathname.endsWith('/deployments/deployment')) result = deployment;
                else if (parsed.pathname.endsWith('/pages/projects/project')) {
                        result = { name: 'project', canonical_deployment: deployment };
                }
                else if (parsed.pathname.endsWith('/domains/example.com')) result = domain;
                else if (parsed.pathname.endsWith('/zones')) {
                        result = [{ id: 'zone', name: 'example.com', status: 'active', type: 'full' }];
                } else if (parsed.pathname.endsWith('/dns_records')) result = [dns];
                else if (parsed.pathname.endsWith('/purge_cache')) result = {};
                else throw new Error(`Unexpected Cloudflare request: ${options.method} ${url}`);
                return { ok: true, status: 200, json: async () => ({ success: true, result }) };
        };
        const runWrangler = async (args, _captureOutput, options) => {
                if (args[1] === 'project') return JSON.stringify([{ name: 'project' }]);
                assert.deepEqual(args, ['pages', 'deploy', 'dist', '--project-name', 'project']);
                writeFileSync(options.outputFilePath, JSON.stringify({
                        type: 'pages-deploy-detailed', version: 1, pages_project: 'project',
                        deployment_id: 'deployment', environment: 'production',
                }));
                return '';
        };
        try {
                const result = await main({
                        env: environment, fetchImpl, runWrangler, projectRoot,
                        logger: { log() {} },
                });
                assert.deepEqual(result.domains, [domain]);
                assert.deepEqual(result.dnsRecords, [dns]);
                assert.equal(result.redirectRule, null);
                assert.equal(requests.filter(({ path }) => path.includes('/domains/')).length, 2);
                assert.deepEqual(
                        requests.filter(({ path }) => path.endsWith('/dns_records'))
                                .map(({ query }) => query.get('name.exact')),
                        ['example.com'],
                );
                assert.equal(requests.some(({ path }) => path.includes('/rulesets')), false);
                const purge = requests.find(({ path }) => path.endsWith('/purge_cache'));
                assert.deepEqual(JSON.parse(purge.body), { hosts: ['example.com'] });
        } finally {
                rmSync(projectRoot, { recursive: true, force: true });
        }
});
