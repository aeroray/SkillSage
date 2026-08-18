export type Settings = {
  proxyUrl?: string;
  githubTokenConfigured: boolean;
};

export type SettingsUpdate = {
  proxyUrl?: string;
  githubToken?: string;
  clearGithubToken?: boolean;
};
