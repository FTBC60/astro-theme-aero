import { defineCollection } from 'astro:content';
import { contentConfig } from './config/content.config';
import { notesLoader } from './lib/notes-loader';
import { z } from 'astro/zod';

const blog = defineCollection({
  loader: notesLoader(contentConfig.notesDir),
  schema: z.object({
    title: z.string().min(1),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    description: z.string().optional(),
    excerpt: z.string().optional(),
    cover: z.string().optional(),
    tags: z.array(z.string().trim().min(1)).default([]),
    publish: z.boolean().default(false),
  }),
});

export const collections = { blog };
