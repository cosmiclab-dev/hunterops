// Story bank fields (STAR + Reflection), shared by the story API routes.
import { z } from 'zod';

export const StoryFields = z.object({
  theme: z.string().trim().max(80).default(''),
  title: z.string().trim().min(3).max(160),
  situation: z.string().trim().max(1500).default(''),
  task: z.string().trim().max(1000).default(''),
  action: z.string().trim().min(3).max(2500),
  result: z.string().trim().max(1000).default(''),
  reflection: z.string().trim().max(1000).default(''),
  bestFor: z.string().trim().max(300).default(''),
});
