export type DetectedTool = {
  id: string;
  name: string;
  skillsPath: string;
  detected: boolean;
};

export type DetectedTools = {
  tools: DetectedTool[];
};
