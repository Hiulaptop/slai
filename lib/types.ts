export type UserStatus = "ACTIVE" | "DISABLED";

export interface AuthUser {
  id: string;
  email: string;
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Credentials {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: AuthUser;
  accessToken: string;
}

export interface AccessTokenResponse {
  accessToken: string;
}

export interface PresentationSummary {
  id: string;
  title: string | null;
  status: "PROCESSING" | "COMPLETED" | "FAILED" | "PENDING";
  currentRevisionNumber: number | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface PresentationPage {
  items: PresentationSummary[];
  nextCursor: string | null;
}

export interface OutlineSlide {
  number: number;
  title: string;
  summary: string;
}

export interface SlideOutline {
  title: string;
  slides: OutlineSlide[];
}

export type SlideCreationPhase = "inputs" | "outline" | "generating";

export interface SlideCreationInputs {
  title: string;
  slideCount: string;
  prompt: string;
  dataFiles: File[];
  templateFiles: File[];
}

export interface PresentationDetail {
  id: string;
  title: string | null;
  status: PresentationSummary["status"];
  outline: SlideOutline | null;
  html: string | null;
  revisionNumber: number | null;
  undoableSlideNumbers: number[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  provider: string;
  modelId: string;
}

export interface SlideEdit {
  slideNumber: number;
  prompt: string;
}

export interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
  };
}

export type DesignMode = "blank" | "template";

export interface DesignBootstrapRequest {
  title: string;
  mode: DesignMode;
  templateId?: string;
  slideCount?: number;
}

export interface DesignBootstrapResponse {
  id: string;
}

export interface TemplateSummary {
  id: string;
  name: string;
}

export interface TemplateListResponse {
  items: TemplateSummary[];
}

export interface DesignSaveRequest {
  generationId: string;
  html: string;
  expectedRevision: number | null;
}
