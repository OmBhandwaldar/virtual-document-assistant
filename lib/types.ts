// Shared client-side types for the workspace UI.

export interface Citation {
  pdfId: string;
  page: number;
  chunkId?: string | null;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  citations?: Citation[];
  error?: boolean;
}

export interface QuizAnswer {
  questionId: string;
  userAnswer: string;
  isCorrect: boolean;
}

export interface QuestionTypes {
  mcq: number;
  saq: number;
  laq: number;
}

export interface QuizResult {
  id: string;
  timestamp: Date;
  score: number;
  total: number;
  answers: QuizAnswer[];
  questionTypes: QuestionTypes;
}

export interface Chat {
  id: string;
  title: string;
  timestamp: Date;
  messages: Message[];
  quizHistory: QuizResult[];
}

export interface PDFRecord {
  id: string;
  title: string;
  filename: string;
  pages?: number | null;
  indexedAt?: string | null;
  uploadedAt?: string;
  chatId?: string | null;
}

export type View = "chat" | "quiz" | "progress";
