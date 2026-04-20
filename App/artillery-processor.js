// Artillery processor for custom logic
module.exports = {
  setup: function(context, ee, next) {
    console.log('🚀 Load testing started');
    next();
  },

  beforeRequest: function(requestParams, context, ee, next) {
    // Add custom headers if needed
    requestParams.headers = requestParams.headers || {};
    requestParams.headers['User-Agent'] = 'Artillery-LoadTest/1.0';
    next();
  },

  afterResponse: function(requestParams, response, context, ee, next) {
    // Track custom metrics
    const statusCode = response.statusCode;
    
    if (statusCode >= 500) {
      ee.emit('customStat', {
        stat: 'server_errors',
        value: 1
      });
    }
    
    if (statusCode === 429) {
      ee.emit('customStat', {
        stat: 'rate_limited',
        value: 1
      });
    }

    next();
  },

  cleanup: function(context, ee, next) {
    console.log('✅ Load testing completed');
    console.log(`📊 Total requests: ${context.vars.totalRequests || 'N/A'}`);
    next();
  }
};
