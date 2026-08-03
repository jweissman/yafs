import { expect, test } from 'bun:test'

import { githubSettings } from '../src/mounts/GitHubSettings'

test('github settings default to api.github.com and carry the token', () => {
  expect(githubSettings({ YAFS_GITHUB_TOKEN: 'secret' })).toEqual({ apiUrl: 'https://api.github.com', token: 'secret' })
})

test('a GH_HOST-style enterprise cloud host resolves to its api subdomain', () => {
  expect(githubSettings({ YAFS_GITHUB_HOST: 'va.ghe.com' }).apiUrl).toBe('https://api.va.ghe.com')
})

test('a self-hosted enterprise host resolves to its api/v3 path', () => {
  expect(githubSettings({ YAFS_GITHUB_HOST: 'github.example.com' }).apiUrl).toBe('https://github.example.com/api/v3')
})

test('an explicit api url overrides the host mapping', () => {
  const settings = githubSettings({ YAFS_GITHUB_HOST: 'va.ghe.com', YAFS_GITHUB_API_URL: 'https://custom.example.com/api' })
  expect(settings.apiUrl).toBe('https://custom.example.com/api')
})

test('a non-https api url is rejected', () => {
  expect(() => githubSettings({ YAFS_GITHUB_API_URL: 'http://insecure.example.com' })).toThrow('must use https')
})
