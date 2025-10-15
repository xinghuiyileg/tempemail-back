// Cloudflare Email Routing API 客户端

export class CloudflareEmailRouting {
  constructor(apiToken, accountId, zoneId) {
    this.apiToken = apiToken
    this.accountId = accountId
    this.zoneId = zoneId
    this.baseURL = 'https://api.cloudflare.com/client/v4'
  }

  async createRule(emailAddress, targetEmail) {
    const url = `${this.baseURL}/zones/${this.zoneId}/email/routing/rules`
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        matchers: [{
          type: 'literal',
          field: 'to',
          value: emailAddress
        }],
        actions: [{
          type: 'forward',
          value: [targetEmail]
        }],
        enabled: true,
        name: `TempEmail: ${emailAddress}`,
        priority: 0
      })
    })

    const data = await response.json()
    
    if (!data.success) {
      throw new Error(data.errors?.[0]?.message || 'Failed to create email rule')
    }

    return data.result
  }

  async deleteRule(ruleId) {
    const url = `${this.baseURL}/zones/${this.zoneId}/email/routing/rules/${ruleId}`
    
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${this.apiToken}`
      }
    })

    const data = await response.json()
    
    if (!data.success) {
      throw new Error(data.errors?.[0]?.message || 'Failed to delete email rule')
    }

    return data.result
  }

  async listRules() {
    const url = `${this.baseURL}/zones/${this.zoneId}/email/routing/rules`
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.apiToken}`
      }
    })

    const data = await response.json()
    
    if (!data.success) {
      throw new Error(data.errors?.[0]?.message || 'Failed to list email rules')
    }

    return data.result
  }

  async getRule(ruleId) {
    const url = `${this.baseURL}/zones/${this.zoneId}/email/routing/rules/${ruleId}`
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.apiToken}`
      }
    })

    const data = await response.json()
    
    if (!data.success) {
      throw new Error(data.errors?.[0]?.message || 'Failed to get email rule')
    }

    return data.result
  }
}

// 从环境变量获取 Cloudflare 客户端
export function getCloudflareClient(env) {
  const apiToken = env.CLOUDFLARE_API_TOKEN
  const accountId = env.CLOUDFLARE_ACCOUNT_ID
  const zoneId = env.CLOUDFLARE_ZONE_ID

  if (!apiToken || !zoneId) {
    throw new Error('Cloudflare credentials not configured')
  }

  return new CloudflareEmailRouting(apiToken, accountId, zoneId)
}

