import { pgTable, serial, text, integer, boolean, timestamp, unique } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("student"), // student | teacher | developer
  avatar: text("avatar").default(""),
  createdAt: timestamp("created_at").defaultNow(),
});
export const courses = pgTable("courses", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  image: text("image").default(""),
  teacherName: text("teacher_name").default(""),
  category: text("category").default("عام"),
  level: text("level").default("جميع المستويات"),
  isPublished: boolean("is_published").default(true),
  sortOrder: integer("sort_order").default(0),
  views: integer("views").default(0),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
});
export const modules = pgTable("modules", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id").notNull(),
  title: text("title").notNull(),
  sortOrder: integer("sort_order").default(0),
});
export const lessons = pgTable("lessons", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id").notNull(),
  moduleId: integer("module_id"),
  type: text("type").notNull().default("video"), // video | pdf | link
  title: text("title").notNull(),
  description: text("description").default(""),
  youtubeId: text("youtube_id").default(""),
  url: text("url").default(""), // drive pdf or external link
  thumbnail: text("thumbnail").default(""),
  duration: text("duration").default(""),
  isFree: boolean("is_free").default(false),
  isProtected: boolean("is_protected").default(true),
  allowDownload: boolean("allow_download").default(false),
  sortOrder: integer("sort_order").default(0),
  views: integer("views").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});
export const codes = pgTable("codes", {
  id: serial("id").primaryKey(),
  lessonId: integer("lesson_id").notNull(),
  code: text("code").notNull().unique(),
  isActive: boolean("is_active").default(true),
  maxUses: integer("max_uses").default(1),
  usedCount: integer("used_count").default(0),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
});
export const access = pgTable("access", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  lessonId: integer("lesson_id").notNull(),
  codeId: integer("code_id"),
  createdAt: timestamp("created_at").defaultNow(),
}, t=>({ uq: unique().on(t.userId, t.lessonId) }));
export const progress = pgTable("progress", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  lessonId: integer("lesson_id").notNull(),
  courseId: integer("course_id").notNull(),
  isCompleted: boolean("is_completed").default(false),
  updatedAt: timestamp("updated_at").defaultNow(),
}, t=>({ uq: unique().on(t.userId, t.lessonId) }));
export const favorites = pgTable("favorites", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  courseId: integer("course_id").notNull(),
}, t=>({ uq: unique().on(t.userId, t.courseId) }));
export const history = pgTable("history", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  lessonId: integer("lesson_id").notNull(),
  courseId: integer("course_id").notNull(),
  watchedAt: timestamp("watched_at").defaultNow(),
});
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").default(""),
  createdAt: timestamp("created_at").defaultNow(),
});
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  actor: text("actor").default(""),
  action: text("action").notNull(),
  details: text("details").default(""),
  createdAt: timestamp("created_at").defaultNow(),
});
export const teacherRequests = pgTable("teacher_requests", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  subject: text("subject").default(""),
  message: text("message").default(""),
  status: text("status").default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
});
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const siteAssets = pgTable("site_assets", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().default(""),
  mime: text("mime").notNull(),
  size: integer("size").notNull().default(0),
  data: text("data").notNull(), // base64 payload
  createdAt: timestamp("created_at").defaultNow(),
});
export const loginAttempts = pgTable("login_attempts", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  lockedUntil: timestamp("locked_until"),
});
