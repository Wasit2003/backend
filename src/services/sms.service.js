const config = require('../config/config');

class SmsService {
  constructor() {
    this.enabled = config.sms.enabled;
    this.provider = config.sms.provider;
    this.apiKey = config.sms.apiKey;
    this.from = config.sms.from;
  }

  async sendSms(to, message) {
    if (!this.enabled) {
      console.log('SMS is disabled. Would have sent:', { to, message });
      return;
    }

    switch (this.provider) {
      case 'console':
        console.log('SMS:', { to, message });
        break;
      // Add other providers here when needed
      default:
        console.log('Unknown SMS provider:', this.provider);
    }
  }
}

module.exports = new SmsService(); 