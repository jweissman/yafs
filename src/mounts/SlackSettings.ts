export type SlackSettings = { apiUrl: string, token: string }

export function slackSettings(environment = process.env): SlackSettings {
  const apiUrl = (environment.YAFS_SLACK_API_URL || 'https://slack.com/api').replace(/\/$/, '')
  const token = environment.YAFS_SLACK_TOKEN; if (!token) throw new Error('YAFS_SLACK_TOKEN is required')
  return { apiUrl, token }
}
