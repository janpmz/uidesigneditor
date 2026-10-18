import { readFileSync } from 'node:fs';

const layout = JSON.parse(readFileSync(new URL('./landing-layout.json', import.meta.url), 'utf8'));

export function landingProject() {
  return { id: 'landing', name: 'Landing page', layout: structuredClone(layout) };
}
