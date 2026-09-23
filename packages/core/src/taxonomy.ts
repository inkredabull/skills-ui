export interface CategoryDef {
  name: string;
  /** Stemmed keywords are matched against stemmed tokens; entries may be prefixes (ending in *). */
  keywords: string[];
}

/** Built-in taxonomy so skills are categorized without any manual setup. */
export const TAXONOMY: CategoryDef[] = [
  {
    name: 'Jobs & career',
    keywords:
      'job resume cv interview hiring recruit* candidate linkedin offer compensation networking application career founder positioning vocabulary rubric'.split(
        ' ',
      ),
  },
  {
    name: 'Health & fitness',
    keywords:
      'workout peloton fitness meal nutrition food exercise recovery coach* diet dinner breakfast lunch shopping recipe'.split(
        ' ',
      ),
  },
  {
    name: 'Engineering',
    keywords:
      'code coding debug deploy* architecture testing test incident api sdk typescript javascript react next.js nextjs vercel build refactor git github ci cd bootstrap runtime cache function* workflow middleware database sandbox turbopack cli bug* pull commit readme standup upgrade forge'.split(
        ' ',
      ),
  },
  {
    name: 'Product & strategy',
    keywords:
      'roadmap spec prd product stakeholder sprint metric* competitive research brainstorm strategy synthesi* okr planning'.split(
        ' ',
      ),
  },
  {
    name: 'Sales & marketing',
    keywords:
      'lead sales marketing seo campaign ad crm pipeline social content brand reputation prospect* reactivate proposal growth outreach ticket'.split(
        ' ',
      ),
  },
  {
    name: 'Finance & ops',
    keywords:
      'invoice payroll tax bill cash accounting bookkeeping budget inventory expense restock month-end quickbooks payable receivable close'.split(
        ' ',
      ),
  },
  {
    name: 'Documents & files',
    keywords:
      'docx pdf pptx xlsx spreadsheet slide* document word powerpoint excel file format'.split(' '),
  },
  {
    name: 'Productivity & planning',
    keywords:
      'calendar reminder* task* schedule priorit* memory daily plan* inbox email morning routine todo digest'.split(
        ' ',
      ),
  },
  {
    name: 'Knowledge & notes',
    keywords:
      'obsidian vault note* wikilink* youtube notebooklm knowledge ingest index search enterprise'.split(
        ' ',
      ),
  },
  {
    name: 'AI & agents',
    keywords:
      'ai agent* plugin mcp prompt llm connector cowork model rag skill claude setup usage'.split(
        ' ',
      ),
  },
  {
    name: 'Family & lifestyle',
    keywords: 'weekend family activit* travel kid* home'.split(' '),
  },
  {
    name: 'Design & creative',
    keywords: 'design canva figma visual image brand creative artifact chart dataviz'.split(' '),
  },
  {
    name: 'Data & analytics',
    keywords: 'data analysis analytic* dashboard report insight* visualiz* metric'.split(' '),
  },
  {
    name: 'People & legal',
    keywords: 'contract legal policy compliance performance onboarding org hr people comp'.split(
      ' ',
    ),
  },
];

export const OTHER = 'Other';
