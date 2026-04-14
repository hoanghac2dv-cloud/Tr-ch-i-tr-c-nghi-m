-- ==========================================
-- SQL KHỞI TẠO CƠ SỞ DỮ LIỆU OLYMPIA GAME
-- ==========================================

-- Bật extension để tạo UUID tự động (nếu chưa có)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Bảng Profiles (Lưu thông tin người dùng và vai trò)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 2. Bảng Lớp học (Classes)
CREATE TABLE IF NOT EXISTS public.classes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 3. Bảng Học sinh (Students)
CREATE TABLE IF NOT EXISTS public.students (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  score INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 4. Bảng Câu hỏi (Questions)
CREATE TABLE IF NOT EXISTS public.questions (
  id INTEGER PRIMARY KEY,
  question TEXT NOT NULL,
  options JSONB NOT NULL,
  correct_answer INTEGER NOT NULL,
  is_answered BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 5. Bảng Cấu hình App (App Settings)
CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- ==========================================
-- THIẾT LẬP BẢO MẬT (RLS - CHO PHÉP CÔNG KHAI)
-- ==========================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Cho phép mọi người đọc và sửa (Vì bạn muốn ai cũng dùng được)
CREATE POLICY "Public full access profiles" ON public.profiles FOR ALL USING (true);
CREATE POLICY "Public full access classes" ON public.classes FOR ALL USING (true);
CREATE POLICY "Public full access students" ON public.students FOR ALL USING (true);
CREATE POLICY "Public full access questions" ON public.questions FOR ALL USING (true);
CREATE POLICY "Public full access settings" ON public.app_settings FOR ALL USING (true);

-- ==========================================
-- TRIGGERS (Tự động tạo Profile khi Signup)
-- ==========================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (new.id, new.email, 'user');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==========================================
-- DỮ LIỆU MẪU (Tùy chọn)
-- ==========================================

INSERT INTO public.app_settings (key, value)
VALUES ('game_config', '{"timer": 15, "isDarkMode": false}')
ON CONFLICT (key) DO NOTHING;

-- Thêm lớp mẫu
INSERT INTO public.classes (id, name)
VALUES 
  ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'Lớp 10A1'),
  ('b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2', 'Lớp 11B2')
ON CONFLICT (name) DO NOTHING;

-- Thêm học sinh mẫu cho lớp 10A1
INSERT INTO public.students (class_id, name, score)
VALUES 
  ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'Nguyễn Văn An', 0),
  ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'Trần Thị Bình', 0),
  ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'Lê Văn Cường', 0),
  ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'Phạm Minh Đức', 0)
ON CONFLICT DO NOTHING;
