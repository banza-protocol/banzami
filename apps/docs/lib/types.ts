export interface ReferenceSubsection {
  id: string
  title: string
  slug: string
  anchor: string
  content: string
}

export interface ReferenceSection {
  id: string
  number: number
  title: string
  slug: string
  anchor: string
  content: string
  subsections: ReferenceSubsection[]
}

export interface ReferenceMeta {
  version: string
  date: string
  author: string
  status: string
}

export interface Reference {
  meta: ReferenceMeta
  tagline: string
  sections: ReferenceSection[]
}
