// Temporary in-memory storage solution
class SessionService {
  constructor() {
    this.sessions = new Map();
    this.refreshTokens = new Map();
  }

  async createSession(userId, token) {
    // Store session with 7-day expiry
    const expiryDate = Date.now() + (60 * 60 * 24 * 7 * 1000); // 7 days in milliseconds
    this.sessions.set(userId, { token, expiryDate });
    return true;
  }

  async getSession(userId) {
    const session = this.sessions.get(userId);
    if (!session) return null;
    
    // Check if session has expired
    if (Date.now() > session.expiryDate) {
      this.sessions.delete(userId);
      return null;
    }
    
    return session.token;
  }

  async invalidateSession(userId) {
    this.sessions.delete(userId);
    return true;
  }

  async storeRefreshToken(userId, refreshToken) {
    // Store refresh token with 30-day expiry
    const expiryDate = Date.now() + (60 * 60 * 24 * 30 * 1000); // 30 days in milliseconds
    this.refreshTokens.set(userId, { token: refreshToken, expiryDate });
    return true;
  }

  async validateRefreshToken(userId, refreshToken) {
    const stored = this.refreshTokens.get(userId);
    if (!stored) return false;
    
    // Check if token has expired
    if (Date.now() > stored.expiryDate) {
      this.refreshTokens.delete(userId);
      return false;
    }
    
    return stored.token === refreshToken;
  }
}

module.exports = new SessionService(); 