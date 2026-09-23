import type { Skill } from '@skills-ui/core';

export type SkillSummary = Omit<Skill, 'body' | 'file' | 'dir'>;
export type SkillDetail = Skill;
export type { Facets, FacetCount } from '@skills-ui/core';
