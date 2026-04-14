import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './lib/supabase';
import AdminDashboard from './components/AdminDashboard';
import { DEFAULT_QUESTIONS_DATA } from './lib/constants';
import { Shield, Settings, Moon, Sun, Volume2, VolumeX } from 'lucide-react';

// --- HỆ THỐNG ÂM THANH (Web Audio API) ---
const AudioEngine = {
  ctx: null,
  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  },
  playTone(freq: number, type: OscillatorType, duration: number, vol = 0.1) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    
    gain.gain.setValueAtTime(vol, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  },
  playHover() {
    this.playTone(600, 'sine', 0.1, 0.05);
  },
  playCorrect() {
    this.playTone(523.25, 'sine', 0.1, 0.1); // C5
    setTimeout(() => this.playTone(659.25, 'sine', 0.1, 0.1), 100); // E5
    setTimeout(() => this.playTone(783.99, 'sine', 0.3, 0.1), 200); // G5
  },
  playWrong() {
    this.playTone(300, 'sawtooth', 0.2, 0.1);
    setTimeout(() => this.playTone(250, 'sawtooth', 0.4, 0.1), 150);
  },
  bgmOscillator: null as OscillatorNode | null,
  bgmGain: null as GainNode | null,
  toggleBGM(play: boolean) {
    if (!this.ctx) this.init();
    if (play) {
      if (this.bgmOscillator) return;
      this.bgmOscillator = this.ctx!.createOscillator();
      this.bgmGain = this.ctx!.createGain();
      this.bgmOscillator.type = 'triangle';
      this.bgmOscillator.frequency.value = 220; // Low hum
      this.bgmGain.gain.value = 0.02; // Very quiet
      this.bgmOscillator.connect(this.bgmGain);
      this.bgmGain.connect(this.ctx!.destination);
      this.bgmOscillator.start();
    } else {
      if (this.bgmOscillator) {
        this.bgmOscillator.stop();
        this.bgmOscillator.disconnect();
        this.bgmOscillator = null;
      }
    }
  }
};

// --- DỮ LIỆU MẶC ĐỊNH ---
const generateDefaultQuestions = () => {
  return DEFAULT_QUESTIONS_DATA.map((item, i) => ({
    id: i + 1,
    question: item.q,
    options: item.o,
    correctAnswer: item.a,
    isAnswered: false,
  }));
};

interface Student {
  id: string;
  name: string;
  score: number;
}

interface Question {
  id: number;
  question: string;
  options: string[];
  correctAnswer: number;
  isAnswered: boolean;
}

export default function App() {
  // Trạng thái ứng dụng
  const [classData, setClassData] = useState<{ [key: string]: Student[] }>({});
  const [activeClass, setActiveClass] = useState('');
  const [newClassNameInput, setNewClassNameInput] = useState('');
  
  const [newStudentName, setNewStudentName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const STUDENTS_PER_PAGE = 10;
  
  const currentStudents = activeClass ? (classData[activeClass] || []) : [];

  const [questions, setQuestions] = useState<Question[]>([]);
  const [timerSetting, setTimerSetting] = useState(15);
  const [timerInput, setTimerInput] = useState(15);
  
  const [isBGMPlaying, setIsBGMPlaying] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  
  // Auth & Routing State (Simplified for public access)
  const [isAdminView, setIsAdminView] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Modal Trạng thái
  const [activeQuestion, setActiveQuestion] = useState<Question | null>(null);
  const [currentCountdown, setCurrentCountdown] = useState(0);
  const [answeringStudentId, setAnsweringStudentId] = useState('');
  const [showAnswerResult, setShowAnswerResult] = useState<string | null>(null); // 'correct' or 'wrong' or 'timeout'
  
  const [showManager, setShowManager] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState(1);

  // State cho Quản lý câu hỏi (AI & Import)
  const questionFileInputRef = useRef<HTMLInputElement>(null);
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiTopic, setAiTopic] = useState('');
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);

  // State cho tính năng Nhập/Xuất danh sách
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Ref cho Timer
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Khởi tạo dữ liệu
  useEffect(() => {
    const initApp = async () => {
      try {
        await fetchGameData();
        setIsAuthLoading(false);
      } catch (err: any) {
        console.error("Init error:", err);
        setAuthError(err.message || "Lỗi khởi tạo dữ liệu");
        setIsAuthLoading(false);
      }
    };

    initApp();

    const handleFirstInteraction = () => {
      AudioEngine.init();
      window.removeEventListener('click', handleFirstInteraction);
    };
    window.addEventListener('click', handleFirstInteraction);
    return () => window.removeEventListener('click', handleFirstInteraction);
  }, []);

  // Xử lý BGM
  useEffect(() => {
    AudioEngine.toggleBGM(isBGMPlaying);
    return () => AudioEngine.toggleBGM(false);
  }, [isBGMPlaying]);

  const fetchGameData = async () => {
    try {
      // Fetch Classes & Students
      const { data: classes, error: classError } = await supabase.from('classes').select('*, students(*)');
      if (classError) throw classError;

      const formattedData: { [key: string]: Student[] } = {};
      classes.forEach((c: any) => {
        formattedData[c.name] = c.students.map((s: any) => ({
          id: s.id,
          name: s.name,
          score: s.score
        }));
      });
      setClassData(formattedData);
      if (classes.length > 0 && !activeClass) {
        setActiveClass(classes[0].name);
      }

      // Fetch Questions
      const { data: qs, error: qError } = await supabase.from('questions').select('*').order('id', { ascending: true });
      if (qError) throw qError;
      
      if (qs && qs.length > 0) {
        setQuestions(qs.map((q: any) => ({
          id: q.id,
          question: q.question,
          options: q.options,
          correctAnswer: q.correct_answer,
          isAnswered: q.is_answered
        })));
      } else {
        // If no questions in DB, generate and save defaults
        const defaults = generateDefaultQuestions();
        setQuestions(defaults);
        // We don't auto-save to DB here to avoid spamming, but Admin can do it.
      }

      // Fetch Settings
      const { data: settings, error: sError } = await supabase.from('app_settings').select('*').eq('key', 'game_config').single();
      if (!sError && settings) {
        setTimerSetting(settings.value.timer);
        setTimerInput(settings.value.timer);
        setIsDarkMode(settings.value.isDarkMode);
      }
    } catch (err) {
      console.error("Error fetching game data:", err);
    }
  };

  // Bộ đếm thời gian
  useEffect(() => {
    if (activeQuestion && currentCountdown > 0 && !showAnswerResult) {
      timerRef.current = setTimeout(() => {
        setCurrentCountdown(prev => prev - 1);
      }, 1000);
    } else if (currentCountdown === 0 && activeQuestion && !showAnswerResult) {
      // Hết giờ
      setShowAnswerResult('timeout');
      AudioEngine.playWrong();
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [activeQuestion, currentCountdown, showAnswerResult]);


  // --- CÁC HÀM XỬ LÝ LOGIC ---

  const handleAddClass = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newClassNameInput.trim();
    if (!trimmed || classData[trimmed]) return;
    
    try {
      const { data, error } = await supabase.from('classes').insert([{ name: trimmed }]).select().single();
      if (error) throw error;

      setClassData(prev => ({ ...prev, [trimmed]: [] }));
      setActiveClass(trimmed);
      setNewClassNameInput('');
      setCurrentPage(1);
      setSearchQuery('');
    } catch (err) {
      alert("Lỗi thêm lớp học");
    }
  };

  const handleDeleteClass = async () => {
    if(window.confirm(`Xác nhận xóa lớp ${activeClass} và toàn bộ danh sách học sinh của lớp này?`)) {
      try {
        const { error } = await supabase.from('classes').delete().eq('name', activeClass);
        if (error) throw error;

        const newData = {...classData};
        delete newData[activeClass];
        const keys = Object.keys(newData);
        if(keys.length === 0) {
          setActiveClass('');
        } else {
          setActiveClass(keys[0]);
        }
        setClassData(newData);
        setCurrentPage(1);
        setSearchQuery('');
      } catch (err) {
        alert("Lỗi xóa lớp học");
      }
    }
  };

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudentName.trim() || !activeClass) return;

    try {
      const { data: classObj } = await supabase.from('classes').select('id').eq('name', activeClass).single();
      if (!classObj) return;

      const { data, error } = await supabase.from('students').insert([{ 
        class_id: classObj.id, 
        name: newStudentName, 
        score: 0 
      }]).select().single();
      
      if (error) throw error;

      setClassData(prev => ({
        ...prev,
        [activeClass]: [...(prev[activeClass] || []), { id: data.id, name: data.name, score: data.score }]
      }));
      setNewStudentName('');
    } catch (err) {
      alert("Lỗi thêm học sinh");
    }
  };

  const handleRemoveStudent = async (id: string) => {
    try {
      const { error } = await supabase.from('students').delete().eq('id', id);
      if (error) throw error;

      setClassData(prev => ({
        ...prev,
        [activeClass]: prev[activeClass].filter(s => s.id !== id)
      }));
    } catch (err) {
      alert("Lỗi xóa học sinh");
    }
  };

  const handleBulkImportSave = async () => {
    if (!bulkText.trim() || !activeClass) return;
    const names = bulkText.split('\n').map(n => n.trim()).filter(n => n !== '');
    
    try {
      const { data: classObj } = await supabase.from('classes').select('id').eq('name', activeClass).single();
      if (!classObj) return;

      const newStudentsPayload = names.map(name => ({
        class_id: classObj.id,
        name: name,
        score: 0
      }));

      const { data, error } = await supabase.from('students').insert(newStudentsPayload).select();
      if (error) throw error;

      const imported = data.map((s: any) => ({ id: s.id, name: s.name, score: s.score }));
      setClassData(prev => ({
        ...prev,
        [activeClass]: [...(prev[activeClass] || []), ...imported]
      }));
      setBulkText('');
      setShowBulkImport(false);
    } catch (err) {
      alert("Lỗi nhập danh sách");
    }
  };

  const handleExportJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(currentStudents, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `danh_sach_lop_${activeClass}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeClass) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (Array.isArray(parsed)) {
          const { data: classObj } = await supabase.from('classes').select('id').eq('name', activeClass).single();
          if (!classObj) return;

          const studentsToInsert = parsed.map(s => ({
            class_id: classObj.id,
            name: s.name,
            score: s.score || 0
          }));

          const { data, error } = await supabase.from('students').insert(studentsToInsert).select();
          if (error) throw error;

          const imported = data.map((s: any) => ({ id: s.id, name: s.name, score: s.score }));
          setClassData(prev => ({
            ...prev,
            [activeClass]: [...(prev[activeClass] || []), ...imported]
          }));
          alert("Đã nhập danh sách thành công!");
        } else {
          alert("File JSON không đúng định dạng (phải là một mảng)!");
        }
      } catch (err) {
        alert("Lỗi nhập danh sách từ file JSON.");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleShuffleQuestions = () => {
    const shuffled = [...questions];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    setQuestions(shuffled);
  };

  const handleResetQuestions = async () => {
    try {
      const { error } = await supabase.from('questions').update({ is_answered: false }).neq('id', 0);
      if (error) throw error;
      setQuestions(questions.map(q => ({ ...q, isAnswered: false })));
    } catch (err) {
      alert("Lỗi reset câu hỏi");
    }
  };

  const handleResetScores = async () => {
    try {
      const studentIds = currentStudents.map(s => s.id);
      const { error } = await supabase.from('students').update({ score: 0 }).in('id', studentIds);
      if (error) throw error;
      
      setClassData(prev => ({
        ...prev,
        [activeClass]: prev[activeClass].map(s => ({ ...s, score: 0 }))
      }));
    } catch (err) {
      alert("Lỗi reset điểm");
    }
  };

  const openQuestionModal = (question: Question) => {
    if (question.isAnswered) return;
    setActiveQuestion(question);
    setCurrentCountdown(timerSetting);
    setShowAnswerResult(null);
    setAnsweringStudentId(currentStudents.length > 0 ? currentStudents[0].id : '');
  };

  const closeQuestionModal = () => {
    setActiveQuestion(null);
    setShowAnswerResult(null);
  };

  const handleSubmitAnswer = async (selectedIndex: number) => {
    if (showAnswerResult || !answeringStudentId || !activeQuestion) return;

    const isCorrect = selectedIndex === activeQuestion.correctAnswer;
    setShowAnswerResult(isCorrect ? 'correct' : 'wrong');

    try {
      if (isCorrect) {
        AudioEngine.playCorrect();
        const student = currentStudents.find(s => s.id === answeringStudentId);
        if (student) {
          const newScore = student.score + 10;
          await supabase.from('students').update({ score: newScore }).eq('id', answeringStudentId);
          
          setClassData(prev => ({
            ...prev,
            [activeClass]: prev[activeClass].map(s => 
              s.id === answeringStudentId ? { ...s, score: newScore } : s
            )
          }));
        }
      } else {
        AudioEngine.playWrong();
      }

      await supabase.from('questions').update({ is_answered: true }).eq('id', activeQuestion.id);
      setQuestions(questions.map(q => 
        q.id === activeQuestion.id ? { ...q, isAnswered: true } : q
      ));
    } catch (err) {
      console.error("Error submitting answer:", err);
    }
  };

  const handleSaveEditedQuestion = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const updatedQ = {
      question: formData.get('questionText') as string,
      options: [
        formData.get('opt0') as string,
        formData.get('opt1') as string,
        formData.get('opt2') as string,
        formData.get('opt3') as string
      ],
      correct_answer: parseInt(formData.get('correctOpt') as string),
      is_answered: false
    };

    try {
      const { error } = await supabase.from('questions').update(updatedQ).eq('id', editingQuestionId);
      if (error) throw error;

      setQuestions(questions.map(q => q.id === editingQuestionId ? { ...q, ...updatedQ, correctAnswer: updatedQ.correct_answer, isAnswered: false } : q));
      alert('Đã lưu câu hỏi!');
    } catch (err) {
      alert("Lỗi lưu câu hỏi");
    }
  };

  const handleExportQuestions = () => {
    const exportData = questions.map(({id, question, options, correctAnswer}) => ({id, question, options, correctAnswer}));
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `bo_cau_hoi_olympia.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleImportQuestions = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const newQuestions = Array.from({ length: 60 }, (_, i) => {
            const importedQ = parsed[i] || parsed[i % parsed.length];
            return {
              id: i + 1,
              question: importedQ?.question || `Câu hỏi ${i + 1}`,
              options: importedQ?.options?.length === 4 ? importedQ.options : ['A', 'B', 'C', 'D'],
              correctAnswer: importedQ?.correctAnswer !== undefined ? importedQ.correctAnswer : 0,
              isAnswered: false,
            };
          });
          setQuestions(newQuestions);
          alert("Đã nhập bộ câu hỏi thành công!");
        } else {
          alert("File JSON không hợp lệ.");
        }
      } catch (err) {
        alert("Lỗi đọc file JSON.");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleGenerateAI = async () => {
    if (!aiTopic.trim()) {
      alert("Vui lòng nhập chủ đề!");
      return;
    }
    setIsGeneratingAI(true);
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      alert("Thiếu GEMINI_API_KEY trong môi trường!");
      setIsGeneratingAI(false);
      return;
    }
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const payload = {
      contents: [{ parts: [{ text: `Viết 60 câu hỏi trắc nghiệm (mỗi câu có 4 đáp án và 1 đáp án đúng) về chủ đề: ${aiTopic}. Đảm bảo chất lượng giáo dục tốt nhất. Trả về dưới dạng JSON array của các object {question, options, correctAnswer}.` }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              question: { type: "STRING" },
              options: { type: "ARRAY", items: { type: "STRING" } },
              correctAnswer: { type: "INTEGER" }
            },
            required: ["question", "options", "correctAnswer"]
          }
        }
      }
    };

    const delays = [1000, 2000, 4000, 8000, 16000];
    
    for (let i = 0; i < 5; i++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(`Lỗi HTTP ${res.status}`);
        const result = await res.json();
        const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (text) {
          const parsed = JSON.parse(text);
          const newQuestions = Array.from({ length: 60 }, (_, idx) => {
            const genQ = parsed[idx] || parsed[idx % parsed.length];
            return {
              id: idx + 1,
              question: genQ?.question || `Câu hỏi AI ${idx + 1}`,
              options: genQ?.options?.length === 4 ? genQ.options : ['A', 'B', 'C', 'D'],
              correct_answer: genQ?.correctAnswer !== undefined ? genQ.correctAnswer : 0,
              is_answered: false,
            };
          });

          // Save to Supabase
          const { error } = await supabase.from('questions').upsert(newQuestions);
          if (error) throw error;

          setQuestions(newQuestions.map(q => ({
            id: q.id,
            question: q.question,
            options: q.options,
            correctAnswer: q.correct_answer,
            isAnswered: q.is_answered
          })));
          
          alert("✨ Đã soạn xong 60 câu hỏi bằng AI và lưu vào DB!");
          setShowAIModal(false);
          break;
        }
      } catch (err) {
        if (i === 4) {
           alert("Lỗi kết nối AI lúc này. Bạn vui lòng thử lại sau nhé!");
        } else {
           await new Promise(r => setTimeout(r, delays[i]));
        }
      }
    }
    setIsGeneratingAI(false);
  };

  // Top 3 Leaderboard
  const topStudents = [...currentStudents].sort((a, b) => b.score - a.score).slice(0, 3);

  // Lọc và Phân trang học sinh
  const filteredStudents = currentStudents.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const totalPages = Math.ceil(filteredStudents.length / STUDENTS_PER_PAGE) || 1;
  
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [filteredStudents.length, totalPages, currentPage]);

  const paginatedStudents = filteredStudents.slice((currentPage - 1) * STUDENTS_PER_PAGE, currentPage * STUDENTS_PER_PAGE);

  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-indigo-900 text-white p-6">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-yellow-400 mb-4"></div>
        <p className="text-indigo-200 animate-pulse">Đang tải dữ liệu trò chơi...</p>
      </div>
    );
  }

  if (authError || !import.meta.env.VITE_SUPABASE_URL) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4">
        <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl text-center">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Shield className="w-10 h-10 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Thiếu cấu hình Supabase</h2>
          <p className="text-gray-600 mb-6">
            Ứng dụng cần thông tin kết nối Supabase để hoạt động. Vui lòng kiểm tra các biến môi trường:
            <code className="block bg-gray-100 p-2 rounded mt-2 text-sm text-red-500">VITE_SUPABASE_URL</code>
            <code className="block bg-gray-100 p-2 rounded mt-1 text-sm text-red-500">VITE_SUPABASE_ANON_KEY</code>
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition"
          >
            Thử lại
          </button>
        </div>
      </div>
    );
  }

  if (isAdminView) {
    return (
      <div className="relative">
        <button 
          onClick={() => setIsAdminView(false)}
          className="fixed top-4 right-4 z-50 bg-white text-indigo-900 px-4 py-2 rounded-lg font-bold shadow-lg hover:bg-gray-100 transition"
        >
          Quay lại Game
        </button>
        <AdminDashboard />
      </div>
    );
  }

  return (
    <div className={`min-h-screen font-sans transition-colors duration-500 flex p-4 gap-4 ${isDarkMode ? 'bg-gray-900 text-gray-100' : 'bg-purple-100/80 text-gray-900'}`} style={{ backgroundColor: isDarkMode ? '#1a1a2e' : '#EAD1EB', backgroundImage: isDarkMode ? 'none' : "url('https://www.transparenttextures.com/patterns/stardust.png')" }}>
      
      {/* Nút Admin & Cài đặt nhanh */}
      <div className="fixed bottom-4 right-4 flex gap-2 z-40">
        <button 
          onClick={() => setIsAdminView(true)}
          className="bg-purple-600 text-white p-3 rounded-full shadow-xl hover:bg-purple-700 transition"
          title="Trang quản trị"
        >
          <Shield className="w-6 h-6" />
        </button>
        <button 
          onClick={() => setIsDarkMode(!isDarkMode)}
          className={`p-3 rounded-full shadow-xl transition ${isDarkMode ? 'bg-yellow-400 text-gray-900 hover:bg-yellow-500' : 'bg-gray-800 text-white hover:bg-gray-900'}`}
          title={isDarkMode ? "Chế độ sáng" : "Chế độ tối"}
        >
          {isDarkMode ? <Sun className="w-6 h-6" /> : <Moon className="w-6 h-6" />}
        </button>
      </div>

      {/* 1. CỘT TRÁI - QUẢN LÝ HỌC SINH & LỚP */}
      <div className={`w-[350px] max-w-full flex-shrink-0 border-[12px] rounded-3xl p-4 shadow-xl flex flex-col h-[95vh] overflow-hidden transition-colors duration-500 ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-[#FAD998] border-[#D79A51]'}`}>
        
        <div className={`mb-4 p-3 rounded-xl border shadow-sm transition-colors duration-500 ${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-white/70 border-yellow-600/30'}`}>
          <div className="flex gap-2 items-center mb-2 justify-start">
            <span className={`font-bold whitespace-nowrap text-sm ${isDarkMode ? 'text-yellow-400' : 'text-red-600'}`}>LỚP:</span>
            <select 
              value={activeClass} 
              onChange={e => { setActiveClass(e.target.value); setCurrentPage(1); setSearchQuery(''); }} 
              className={`min-w-[120px] p-1.5 rounded-lg border-2 outline-none font-bold transition-colors duration-500 ${isDarkMode ? 'bg-gray-600 border-gray-500 text-white' : 'bg-white border-red-300 text-indigo-900'}`}
            >
              {Object.keys(classData).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button onClick={handleDeleteClass} className="bg-red-500 hover:bg-red-600 text-white px-2 py-1.5 rounded-lg text-xs transition" title="Xóa lớp này">✕</button>
          </div>
          <form onSubmit={handleAddClass} className="flex gap-1">
             <input type="text" placeholder="Thêm lớp mới (VD: 9A1)..." value={newClassNameInput} onChange={e => setNewClassNameInput(e.target.value)} className={`flex-1 text-xs px-2 py-1.5 border rounded-lg outline-none transition-colors duration-500 ${isDarkMode ? 'bg-gray-600 border-gray-500 text-white placeholder-gray-400' : 'bg-white border-gray-300'}`} />
             <button type="submit" className="bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow transition">Thêm</button>
          </form>
        </div>

        <form onSubmit={handleAddStudent} className="flex gap-2 mb-3 w-full">
          <input 
            type="text" 
            placeholder="Nhập tên học sinh..." 
            value={newStudentName}
            onChange={(e) => setNewStudentName(e.target.value)}
            className={`flex-1 min-w-0 rounded-full px-3 py-2 border-2 outline-none text-sm transition-colors duration-500 ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-yellow-600'}`}
          />
          <button type="submit" className="bg-blue-500 text-white px-5 py-2 rounded-full font-bold shadow-md hover:bg-blue-600 transition shrink-0">
            Thêm
          </button>
        </form>

        <div className="mb-3">
           <input 
             type="text" 
             placeholder="🔍 Tìm kiếm học sinh..." 
             value={searchQuery} 
             onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }} 
             className={`w-full rounded-full px-4 py-1.5 border-2 outline-none text-sm shadow-inner transition-colors duration-500 ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-indigo-300'}`} 
           />
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3 w-full">
          <button onClick={() => setShowBulkImport(true)} className="text-[11px] bg-purple-600 hover:bg-purple-700 text-white py-2 px-1 rounded-lg font-bold shadow transition flex items-center justify-center gap-1">
            📝 Dán DS
          </button>
          <button onClick={handleExportJSON} className="text-[11px] bg-green-600 hover:bg-green-700 text-white py-2 px-1 rounded-lg font-bold shadow transition flex items-center justify-center gap-1">
            ⬇️ Xuất
          </button>
          <button onClick={() => fileInputRef.current?.click()} className="text-[11px] bg-orange-500 hover:bg-orange-600 text-white py-2 px-1 rounded-lg font-bold shadow transition flex items-center justify-center gap-1">
            ⬆️ Nhập
          </button>
          <input type="file" accept=".json" ref={fileInputRef} onChange={handleImportJSON} className="hidden" />
        </div>

        <div className="flex-1 overflow-y-auto pr-2 space-y-2 relative">
          {paginatedStudents.length === 0 ? (
            <p className={`text-center text-sm italic mt-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Không có dữ liệu</p>
          ) : (
            paginatedStudents.map((student, idx) => {
              const globalIdx = (currentPage - 1) * STUDENTS_PER_PAGE + idx + 1;
              return (
                <div key={student.id} className={`flex justify-between items-center border-b p-2 rounded-lg transition-colors duration-500 ${isDarkMode ? 'bg-gray-700/50 border-gray-600 hover:bg-gray-600' : 'bg-yellow-50/50 border-yellow-600/30 hover:bg-yellow-100'}`}>
                  <span className={`font-semibold text-sm truncate pr-2 ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`} title={student.name}>{globalIdx}. {student.name}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`font-bold text-sm ${isDarkMode ? 'text-yellow-400' : 'text-red-600'}`}>{student.score}đ</span>
                    <button onClick={() => handleRemoveStudent(student.id)} className="text-red-500 font-bold hover:scale-125 transition w-5 h-5 flex items-center justify-center">✕</button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {totalPages > 1 && (
          <div className={`flex justify-between items-center mt-3 pt-3 border-t-2 transition-colors duration-500 ${isDarkMode ? 'border-gray-600' : 'border-yellow-600/30'}`}>
             <button disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)} className={`px-3 py-1 border-2 rounded-lg text-xs font-bold disabled:opacity-40 transition-colors duration-500 ${isDarkMode ? 'bg-gray-700 border-gray-500 text-gray-300 hover:bg-gray-600' : 'bg-white border-yellow-600 text-yellow-800 hover:bg-yellow-50'}`}>❮ Trước</button>
             <span className={`text-sm font-bold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{currentPage} / {totalPages}</span>
             <button disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)} className={`px-3 py-1 border-2 rounded-lg text-xs font-bold disabled:opacity-40 transition-colors duration-500 ${isDarkMode ? 'bg-gray-700 border-gray-500 text-gray-300 hover:bg-gray-600' : 'bg-white border-yellow-600 text-yellow-800 hover:bg-yellow-50'}`}>Sau ❯</button>
          </div>
        )}
      </div>

      {/* 2. MÀN HÌNH CHÍNH */}
      <div className="flex-1 flex flex-col relative h-[95vh]">
        
        <div className="flex justify-between items-start mb-4">
          <div className="space-y-3">
            <h1 className={`text-4xl font-extrabold drop-shadow-md tracking-wider transition-colors duration-500 ${isDarkMode ? 'text-yellow-400' : 'text-indigo-900'}`}>
              GAMES LEO NÚI OLYMPIA
            </h1>
            
            <div className={`flex items-center gap-4 p-2 rounded-lg inline-flex shadow-sm transition-colors duration-500 ${isDarkMode ? 'bg-gray-800/80 border border-gray-700' : 'bg-white/50'}`}>
              <span className={`font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Thời gian đếm ngược (giây):</span>
              <input 
                type="number" 
                value={timerInput} 
                onChange={(e) => setTimerInput(parseInt(e.target.value) || 0)}
                className={`w-16 border rounded px-2 py-1 text-center font-bold transition-colors duration-500 ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white'}`}
              />
              <button 
                onClick={() => { setTimerSetting(timerInput); alert(`Đã xác nhận thời gian: ${timerInput} giây!`); }}
                className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-1 rounded shadow font-bold whitespace-nowrap"
              >
                Xác nhận
              </button>
            </div>

            <div className="flex gap-2">
              <button onClick={handleResetQuestions} className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg font-bold shadow-md transition transform hover:-translate-y-1">
                Reset câu hỏi
              </button>
              <button onClick={handleResetScores} className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg font-bold shadow-md transition transform hover:-translate-y-1">
                Reset Bảng Điểm
              </button>
              <button onClick={handleShuffleQuestions} className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg font-bold shadow-md transition transform hover:-translate-y-1">
                Trộn ngẫu nhiên
              </button>
              <button onClick={() => setShowManager(true)} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-bold shadow-md transition transform hover:-translate-y-1">
                ⚙️ Quản lý câu hỏi
              </button>
              <button onClick={() => setIsBGMPlaying(!isBGMPlaying)} className="bg-gray-700 hover:bg-gray-800 text-white px-4 py-2 rounded-lg shadow-md transition">
                {isBGMPlaying ? '🔇 Tắt Nhạc' : '🎵 Bật Nhạc'}
              </button>
              <button onClick={() => setIsDarkMode(!isDarkMode)} className={`${isDarkMode ? 'bg-yellow-400 text-gray-900' : 'bg-indigo-900 text-white'} px-4 py-2 rounded-lg shadow-md transition font-bold`}>
                {isDarkMode ? '☀️ Chế độ sáng' : '🌙 Chế độ tối'}
              </button>
            </div>
          </div>

          <div className="bg-[#5C3A21] border-4 border-[#F5A623] rounded-[2rem] p-4 text-white w-64 shadow-2xl relative mt-2">
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 flex gap-1">
              {[1,2,3].map(i => <span key={i} className="text-3xl text-yellow-400 drop-shadow-lg">★</span>)}
            </div>
            <h3 className="text-center font-black text-xl text-yellow-400 mb-3 mt-2 uppercase tracking-widest">TOP 3</h3>
            <div className="space-y-2">
              {topStudents.length > 0 ? topStudents.map((s, i) => (
                <div key={s.id} className="flex justify-between items-center bg-white/10 px-3 py-1 rounded-full text-sm">
                  <span className="font-bold truncate w-2/3">{i+1}. {s.name}</span>
                  <span className="text-yellow-300 font-bold">{s.score}</span>
                </div>
              )) : <div className="text-center text-white/50 text-sm">Chưa có dữ liệu</div>}
            </div>
          </div>
        </div>

        <div className={`flex-1 rounded-3xl p-6 shadow-inner overflow-y-auto border-4 transition-colors duration-500 ${isDarkMode ? 'bg-gray-800/50 border-gray-700' : 'bg-white/30 border-white/40'}`}>
          <div className="grid grid-cols-10 gap-x-2 gap-y-4">
            {questions.map((q) => (
              <button
                key={q.id}
                onMouseEnter={() => AudioEngine.playHover()}
                onClick={() => openQuestionModal(q)}
                disabled={q.isAnswered}
                className={`
                  aspect-square rounded-full flex items-center justify-center text-xl font-bold shadow-lg transition-all duration-200 relative overflow-hidden group
                  ${q.isAnswered 
                    ? (isDarkMode ? 'bg-gray-700 opacity-30 cursor-not-allowed scale-95' : 'bg-gray-300 opacity-50 cursor-not-allowed scale-95')
                    : (isDarkMode ? 'bg-gray-700 border-4 border-blue-500 hover:scale-110 hover:shadow-xl hover:shadow-blue-500/50 cursor-pointer' : 'bg-white border-4 border-blue-400 hover:scale-110 hover:shadow-xl hover:shadow-blue-400/50 cursor-pointer')
                  }
                `}
              >
                <img 
                  src="https://upload.wikimedia.org/wikipedia/en/b/bd/Doraemon_character.png" 
                  alt="Doraemon"
                  className={`w-full h-full object-contain p-1 transition-all ${q.isAnswered ? 'grayscale opacity-50' : 'group-hover:scale-110'}`}
                  referrerPolicy="no-referrer"
                />
                <div className={`absolute inset-0 flex items-center justify-center bg-black/20 text-white text-xl font-black drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] transition-opacity ${q.isAnswered ? 'opacity-100' : 'opacity-100 group-hover:bg-black/40'}`}>
                  {q.id}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* --- MODAL HIỂN THỊ CÂU HỎI KHI CHƠI --- */}
      {activeQuestion && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className={`rounded-3xl w-[800px] p-8 relative shadow-2xl transform scale-100 transition-all duration-500 flex flex-col ${isDarkMode ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'}`}>
            
            <div className={`flex justify-between items-center mb-6 pb-4 border-b transition-colors duration-500 ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
              <h2 className={`text-3xl font-bold ${isDarkMode ? 'text-yellow-400' : 'text-indigo-800'}`}>CÂU SỐ {activeQuestion.id}</h2>
              <div className={`text-4xl font-black w-20 h-20 flex items-center justify-center rounded-full shadow-inner transition-colors duration-500 ${currentCountdown <= 5 ? 'bg-red-100 text-red-600 animate-pulse' : (isDarkMode ? 'bg-gray-700 text-blue-400' : 'bg-blue-50 text-blue-600')}`}>
                {currentCountdown}
              </div>
              <button onClick={closeQuestionModal} className="absolute -top-4 -right-4 bg-red-500 hover:bg-red-600 text-white w-12 h-12 rounded-full font-bold text-2xl shadow-lg border-4 border-white">✕</button>
            </div>

            <div className={`mb-6 flex items-center gap-4 p-4 rounded-xl transition-colors duration-500 ${isDarkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
              <span className={`font-bold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Học sinh trả lời:</span>
              <select 
                value={answeringStudentId} 
                onChange={(e) => setAnsweringStudentId(e.target.value)}
                className={`flex-1 p-2 rounded-lg border outline-none font-semibold text-lg transition-colors duration-500 ${isDarkMode ? 'bg-gray-600 border-gray-500 text-white' : 'bg-white border-gray-300'}`}
                disabled={!!showAnswerResult}
              >
                <option value="" disabled>-- Chọn học sinh --</option>
                {currentStudents.map(s => <option key={s.id} value={s.id}>{s.name} (Hiện tại: {s.score}đ)</option>)}
              </select>
            </div>

            <div className={`text-2xl font-semibold mb-8 min-h-[100px] flex items-center ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>
              {activeQuestion.question}
            </div>

            <div className="grid grid-cols-2 gap-4 mt-auto">
              {activeQuestion.options.map((opt, idx) => {
                let btnStyle = isDarkMode 
                  ? "bg-gray-700 hover:bg-gray-600 border-2 border-gray-600 text-gray-200"
                  : "bg-blue-100 hover:bg-blue-200 border-2 border-blue-300 text-blue-900";
                
                if (showAnswerResult) {
                  if (idx === activeQuestion.correctAnswer) {
                    btnStyle = "bg-green-500 text-white border-green-600 scale-105 shadow-lg shadow-green-500/50 z-10";
                  } else {
                    btnStyle = isDarkMode ? "bg-gray-800 text-gray-600 border-gray-700 opacity-50" : "bg-gray-200 text-gray-400 border-gray-300 opacity-50";
                  }
                }

                return (
                  <button
                    key={idx}
                    disabled={!!showAnswerResult}
                    onClick={() => handleSubmitAnswer(idx)}
                    className={`p-6 rounded-2xl text-xl font-bold transition-all duration-300 text-left ${btnStyle}`}
                  >
                    <span className="inline-block w-8 font-black opacity-60 mr-2">{['A', 'B', 'C', 'D'][idx]}.</span>
                    {opt}
                  </button>
                )
              })}
            </div>

            {showAnswerResult && (
              <div className={`absolute inset-0 backdrop-blur-sm rounded-3xl flex flex-col items-center justify-center animate-fadeIn z-20 transition-colors duration-500 ${isDarkMode ? 'bg-gray-900/90' : 'bg-white/90'}`}>
                {showAnswerResult === 'correct' && <div className="text-6xl font-black text-green-500 mb-4 animate-bounce">🎉 CHÍNH XÁC! +10đ</div>}
                {showAnswerResult === 'wrong' && <div className="text-6xl font-black text-red-500 mb-4 animate-shake">❌ SAI RỒI!</div>}
                {showAnswerResult === 'timeout' && <div className="text-6xl font-black text-orange-500 mb-4">⏰ HẾT GIỜ!</div>}
                <button onClick={closeQuestionModal} className="mt-8 bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-4 rounded-full text-2xl font-bold shadow-xl transition-transform hover:scale-110">
                  Đóng & Tiếp Tục
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- MODAL DÁN DANH SÁCH --- */}
      {showBulkImport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-[600px] p-6 shadow-2xl flex flex-col animate-fadeIn">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-indigo-800">Nhập danh sách nhanh</h2>
              <button onClick={() => setShowBulkImport(false)} className="text-gray-500 hover:text-red-500 font-bold text-2xl">✕</button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Bạn có thể <strong className="text-indigo-600">Copy cột Họ Tên từ Excel, Word hoặc file Text</strong> và dán vào ô bên dưới. Mỗi dòng sẽ tương ứng với 1 học sinh.
            </p>
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder="Nguyễn Văn A&#10;Trần Thị B&#10;Lê Văn C..."
              className="w-full h-64 border-2 border-indigo-200 rounded-xl p-4 outline-none focus:border-indigo-500 mb-4 resize-none font-medium"
            ></textarea>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowBulkImport(false)} className="px-5 py-2 bg-gray-200 hover:bg-gray-300 rounded-xl font-bold text-gray-700 transition">Hủy</button>
              <button onClick={handleBulkImportSave} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-md transition transform hover:scale-105">Lưu danh sách</button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL QUẢN LÝ CÂU HỎI --- */}
      {showManager && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-[900px] max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="bg-purple-700 text-white p-4 flex justify-between items-center">
              <h2 className="text-xl font-bold">Quản Lý Ngân Hàng Câu Hỏi (60 Câu)</h2>
              <div className="flex gap-2 items-center">
                <button onClick={() => setShowAIModal(true)} className="bg-gradient-to-r from-pink-500 to-orange-400 hover:from-pink-600 hover:to-orange-500 px-3 py-1.5 rounded-lg shadow-md text-sm font-bold flex items-center gap-1 transition transform hover:scale-105">✨ Tạo bằng AI</button>
                <div className="w-px h-6 bg-white/30 mx-1"></div>
                <button onClick={handleExportQuestions} className="bg-green-500 hover:bg-green-600 px-3 py-1.5 rounded-lg shadow-md text-sm font-bold flex items-center gap-1 transition">⬇️ Xuất File</button>
                <button onClick={() => questionFileInputRef.current?.click()} className="bg-blue-500 hover:bg-blue-600 px-3 py-1.5 rounded-lg shadow-md text-sm font-bold flex items-center gap-1 transition">⬆️ Tải File Lên</button>
                <input type="file" accept=".json" ref={questionFileInputRef} onChange={handleImportQuestions} className="hidden" />
                <button onClick={() => setShowManager(false)} className="text-white hover:text-red-300 text-2xl font-bold ml-3 transition">✕</button>
              </div>
            </div>
            
            <div className="flex flex-1 overflow-hidden">
              <div className="w-1/4 border-r overflow-y-auto bg-gray-50 p-2">
                <div className="grid grid-cols-3 gap-1">
                  {questions.map(q => (
                    <button 
                      key={q.id}
                      onClick={() => setEditingQuestionId(q.id)}
                      className={`p-2 text-center rounded text-sm font-bold ${editingQuestionId === q.id ? 'bg-purple-500 text-white' : 'bg-white border hover:bg-gray-100'}`}
                    >
                      {q.id}
                    </button>
                  ))}
                </div>
              </div>

              <div className="w-3/4 p-6 overflow-y-auto">
                {(() => {
                  const editingQ = questions.find(q => q.id === editingQuestionId);
                  if (!editingQ) return null;
                  return (
                    <form key={editingQ.id} onSubmit={handleSaveEditedQuestion} className="space-y-4">
                      <h3 className="text-xl font-bold text-gray-800 border-b pb-2">Chỉnh sửa Câu số {editingQ.id}</h3>
                      
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Nội dung câu hỏi</label>
                        <textarea 
                          name="questionText"
                          defaultValue={editingQ.question}
                          required
                          className="w-full border rounded-lg p-2 min-h-[100px] outline-none focus:ring-2 focus:ring-purple-400"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        {[0, 1, 2, 3].map(idx => (
                          <div key={idx}>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Đáp án {['A', 'B', 'C', 'D'][idx]}</label>
                            <input 
                              type="text" 
                              name={`opt${idx}`}
                              defaultValue={editingQ.options[idx]}
                              required
                              className="w-full border rounded-lg p-2 outline-none focus:ring-2 focus:ring-purple-400"
                            />
                          </div>
                        ))}
                      </div>

                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Đáp án ĐÚNG</label>
                        <select name="correctOpt" defaultValue={editingQ.correctAnswer} className="w-full border rounded-lg p-2 outline-none focus:ring-2 focus:ring-purple-400">
                          <option value={0}>A</option>
                          <option value={1}>B</option>
                          <option value={2}>C</option>
                          <option value={3}>D</option>
                        </select>
                      </div>

                      <div className="pt-4 text-right">
                        <button type="submit" className="bg-green-500 hover:bg-green-600 text-white px-6 py-2 rounded-lg font-bold shadow">
                          Lưu Câu Hỏi
                        </button>
                      </div>
                    </form>
                )
              })()}
            </div>
          </div>
        </div>
      </div>
    )}

    {/* --- MODAL TẠO CÂU HỎI BẰNG AI --- */}
    {showAIModal && (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] backdrop-blur-sm">
        <div className="bg-white rounded-3xl w-[500px] p-8 shadow-2xl flex flex-col animate-fadeIn">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-500">✨ Trợ lý AI tạo câu hỏi</h2>
            <button onClick={() => !isGeneratingAI && setShowAIModal(false)} className="text-gray-400 hover:text-red-500 font-bold text-2xl transition">✕</button>
          </div>
          
          <p className="text-sm text-gray-600 mb-6 leading-relaxed">
            Chỉ cần nhập chủ đề bạn muốn, hệ thống Trí tuệ Nhân tạo sẽ tự động biên soạn <strong className="text-purple-600">60 câu hỏi trắc nghiệm</strong> kèm đáp án chính xác trong giây lát.
          </p>
          
          <div className="mb-8">
            <label className="block text-sm font-bold text-gray-700 mb-2">Chủ đề mong muốn:</label>
            <input 
              type="text"
              placeholder="VD: Lịch sử thời Lý, Địa lý lớp 9, An toàn giao thông..."
              value={aiTopic}
              onChange={e => setAiTopic(e.target.value)}
              disabled={isGeneratingAI}
              className="w-full border-2 border-purple-200 rounded-xl p-3 outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-100 transition font-medium text-lg"
            />
          </div>
          
          <div className="flex justify-end gap-3">
            <button disabled={isGeneratingAI} onClick={() => setShowAIModal(false)} className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 rounded-xl font-bold text-gray-700 transition disabled:opacity-50">Hủy bỏ</button>
            <button 
              onClick={handleGenerateAI} 
              disabled={isGeneratingAI}
              className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 text-white rounded-xl font-bold shadow-md transition transform hover:-translate-y-1 hover:shadow-lg disabled:opacity-70 disabled:hover:translate-y-0 disabled:hover:shadow-md flex items-center justify-center min-w-[150px]"
            >
              {isGeneratingAI ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  Đang tạo...
                </span>
              ) : 'Bắt đầu tạo'}
            </button>
          </div>
        </div>
      </div>
    )}

    <style dangerouslySetInnerHTML={{__html: `
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .animate-fadeIn { animation: fadeIn 0.3s ease-out forwards; }
        
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-10px); }
          50% { transform: translateX(10px); }
          75% { transform: translateX(-10px); }
        }
        .animate-shake { animation: shake 0.4s ease-in-out; }
      `}} />

    </div>
  );
}
