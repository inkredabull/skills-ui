// Browser-safe (no Node imports): shared by the server and the web form.

export const NAME_MAX = 64;
export const DESCRIPTION_MAX = 1024;
const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateSkillInput({
  name,
  description,
}: {
  name: string;
  description: string;
}): string[] {
  const errors: string[] = [];
  if (!name) errors.push('Name is required');
  else if (name.length > NAME_MAX) errors.push(`Name must be at most ${NAME_MAX} characters`);
  else if (!NAME_RE.test(name)) {
    errors.push('Name may only contain lowercase letters, numbers and single hyphens');
  }
  if (!description.trim()) errors.push('Description is required');
  else if (description.length > DESCRIPTION_MAX) {
    errors.push(`Description must be at most ${DESCRIPTION_MAX} characters`);
  }
  return errors;
}
