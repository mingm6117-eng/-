module.exports = {
  apps: [
    {
      name: 'industry-brief-site',
      script: 'server.js',
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || 5500,
      },
    },
  ],
};
