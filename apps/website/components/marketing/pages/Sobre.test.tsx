// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { SobrePage } from './Sobre';

afterEach(cleanup);

const src = readFileSync('components/marketing/pages/Sobre.tsx', 'utf8');
const navSrc = readFileSync('lib/marketing/nav.ts', 'utf8');

describe('/sobre — Mission and Principles', () => {
  it('renders both the Mission and the Principles sections (PT)', () => {
    render(<SobrePage lang="pt" />);
    expect(screen.getByText('MISSÃO')).toBeTruthy();
    expect(screen.getByText('PRINCÍPIOS')).toBeTruthy();
    expect(screen.getByText('deve ser simples.')).toBeTruthy(); // Mission headline tail
  });

  it('lists exactly the four canonical principles (PT)', () => {
    render(<SobrePage lang="pt" />);
    for (const t of ['Simplicidade', 'Segurança', 'Transparência', 'Abertura']) {
      expect(screen.getByText(t)).toBeTruthy();
    }
  });

  it('renders Mission and Principles in English too', () => {
    render(<SobrePage lang="en" />);
    expect(screen.getByText('MISSION')).toBeTruthy();
    expect(screen.getByText('PRINCIPLES')).toBeTruthy();
    for (const t of ['Simplicity', 'Security', 'Transparency', 'Openness']) {
      expect(screen.getByText(t)).toBeTruthy();
    }
  });

  it('exposes a stable #principios anchor alongside the existing #missao', () => {
    const { container } = render(<SobrePage lang="pt" />);
    expect(container.querySelector('#missao')).toBeTruthy();
    expect(container.querySelector('#principios')).toBeTruthy();
  });

  it('numbers the sections uniquely and sequentially 01..05 (no duplicates)', () => {
    const nums = [...src.matchAll(/<SectionLabel n="(\d{2})"/g)].map((m) => m[1]);
    expect(nums).toEqual(['01', '02', '03', '04', '05']);
    expect(new Set(nums).size).toBe(nums.length); // no duplicate section numbers
  });

  it('does not overclaim (no absolute-security / regulated / licensed language)', () => {
    render(<SobrePage lang="pt" />);
    render(<SobrePage lang="en" />);
    const body = document.body.textContent ?? '';
    for (const bad of [
      'segurança absoluta', '100% seguro', 'totalmente seguro',
      'regulado', 'licenciado', 'instantâneo sempre', 'totalmente descentralizado',
    ]) {
      expect(body.toLowerCase()).not.toContain(bad);
    }
  });
});

describe('About mega-menu promise', () => {
  it('the "A startup" entry still promises "Missão e princípios."', () => {
    // The page now fulfils this promise (Mission + Principles both present).
    expect(navSrc.includes("'Missão e princípios.'")).toBe(true);
  });
});
