/** @param {{ config: import('expo/config').ExpoConfig }} context */
module.exports = ({ config }) => {
  const owner = process.env.EXPO_OWNER?.trim();
  const projectId = process.env.EXPO_PUBLIC_PROJECT_ID?.trim();
  if (projectId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
    throw new Error('EXPO_PUBLIC_PROJECT_ID must be a UUID.');
  }
  if (process.env.EXPO_PUBLIC_APP_ENV === 'production' && (!owner || !projectId)) {
    throw new Error('Release build identity must be configured in frontend/.env.');
  }
  return {
    ...config,
    ...(owner ? { owner } : {}),
    extra: { ...config.extra, ...(projectId ? { eas: { projectId } } : {}) },
  };
};
