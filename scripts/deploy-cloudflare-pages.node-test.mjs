import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { main, readDomainConfig } from './deploy-cloudflare-pages.mjs';

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
