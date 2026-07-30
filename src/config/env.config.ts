export const envConfig = () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    modelName: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  },
  gcp: {
    projectId: process.env.GCP_PROJECT_ID || 'quickburnai',
    location: process.env.GCP_LOCATION || 'us-central1',
  },
  firestore: {
    projectId: process.env.GCP_PROJECT_ID || 'quickburnai',
    keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS || undefined,
  },
});
