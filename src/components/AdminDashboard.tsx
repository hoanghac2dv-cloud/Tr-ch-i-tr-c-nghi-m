import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { motion } from 'motion/react';
import { Users, BookOpen, Settings, ShieldCheck, Trash2, Edit, Plus, Search } from 'lucide-react';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<'users' | 'classes' | 'questions'>('users');
  const [users, setUsers] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setSearchQuery('');
    fetchData();
  }, [activeTab]);

  const filteredUsers = users.filter(u => 
    u.email?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    u.id?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredClasses = classes.filter(c => 
    c.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredQuestions = questions.filter(q => 
    q.question?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    q.id?.toString().includes(searchQuery)
  );

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'users') {
        const { data, error } = await supabase.from('profiles').select('*');
        if (error) throw error;
        setUsers(data || []);
      } else if (activeTab === 'classes') {
        const { data, error } = await supabase.from('classes').select('*, students(*)');
        if (error) throw error;
        setClasses(data || []);
      } else if (activeTab === 'questions') {
        const { data, error } = await supabase.from('questions').select('*').order('id', { ascending: true });
        if (error) throw error;
        setQuestions(data || []);
      }
    } catch (err) {
      console.error('Error fetching admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = async () => {
    if (!newItemName.trim()) return;
    try {
      if (activeTab === 'classes') {
        const { error } = await supabase.from('classes').insert([{ name: newItemName }]);
        if (error) throw error;
      }
      setNewItemName('');
      setShowAddModal(false);
      fetchData();
    } catch (err) {
      alert('Lỗi thêm dữ liệu');
    }
  };

  const deleteItem = async (id: string | number) => {
    if (!window.confirm('Xác nhận xóa?')) return;
    try {
      const table = activeTab === 'users' ? 'profiles' : activeTab;
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
      fetchData();
    } catch (err) {
      alert('Lỗi xóa dữ liệu');
    }
  };

  const updateUserRole = async (userId: string, newRole: string) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', userId);
      if (error) throw error;
      fetchData();
    } catch (err) {
      alert('Lỗi cập nhật quyền hạn');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <div className="w-64 bg-indigo-900 text-white p-6 flex flex-col">
        <div className="flex items-center gap-3 mb-10">
          <ShieldCheck className="text-yellow-400 w-8 h-8" />
          <h1 className="text-xl font-bold tracking-tight">Admin Panel</h1>
        </div>

        <nav className="space-y-2 flex-1">
          <button
            onClick={() => setActiveTab('users')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'users' ? 'bg-indigo-700 text-white shadow-lg' : 'text-indigo-300 hover:bg-indigo-800'}`}
          >
            <Users className="w-5 h-5" /> Quản lý người dùng
          </button>
          <button
            onClick={() => setActiveTab('classes')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'classes' ? 'bg-indigo-700 text-white shadow-lg' : 'text-indigo-300 hover:bg-indigo-800'}`}
          >
            <BookOpen className="w-5 h-5" /> Quản lý lớp học
          </button>
          <button
            onClick={() => setActiveTab('questions')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'questions' ? 'bg-indigo-700 text-white shadow-lg' : 'text-indigo-300 hover:bg-indigo-800'}`}
          >
            <Settings className="w-5 h-5" /> Ngân hàng câu hỏi
          </button>
        </nav>

        <div className="pt-6 border-t border-indigo-800">
          <p className="text-xs text-indigo-400 uppercase font-bold tracking-widest mb-4">Hệ thống</p>
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-indigo-300 hover:bg-indigo-800 transition-all">
            <Settings className="w-5 h-5" /> Cài đặt chung
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-10 overflow-y-auto">
        <header className="flex justify-between items-center mb-10">
          <div>
            <h2 className="text-3xl font-bold text-gray-900">
              {activeTab === 'users' && 'Quản lý người dùng'}
              {activeTab === 'classes' && 'Quản lý lớp học'}
              {activeTab === 'questions' && 'Quản lý câu hỏi'}
            </h2>
            <p className="text-gray-500 mt-1">Xem và quản lý dữ liệu hệ thống Olympia Game</p>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input 
                type="text" 
                placeholder="Tìm kiếm..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2 rounded-lg border border-gray-200 outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            {activeTab === 'classes' && (
              <button 
                onClick={() => setShowAddModal(true)}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-indigo-700 transition shadow-md"
              >
                <Plus className="w-4 h-4" /> Thêm lớp
              </button>
            )}
          </div>
        </header>

        {showAddModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
              <h3 className="text-xl font-bold mb-4">Thêm lớp học mới</h3>
              <input 
                type="text" 
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                placeholder="Tên lớp (VD: 10A1)"
                className="w-full px-4 py-2 border rounded-lg mb-4 outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowAddModal(false)} className="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded-lg">Hủy</button>
                <button onClick={handleAddItem} className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold">Thêm</button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          </div>
        ) : activeTab === 'users' ? (
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">ID</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Email</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Vai trò</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Ngày tạo</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm text-gray-500 font-mono">{user.id.substring(0, 8)}...</td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{user.email}</td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${user.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(user.updated_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button 
                        onClick={() => updateUserRole(user.id, user.role === 'admin' ? 'user' : 'admin')}
                        className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        title="Đổi vai trò"
                      >
                        <ShieldCheck className="w-4 h-4" />
                      </button>
                      <button className="p-2 text-gray-400 hover:bg-gray-50 rounded-lg transition-colors">
                        <Edit className="w-4 h-4" />
                      </button>
                      <button onClick={() => deleteItem(user.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : activeTab === 'classes' ? (
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Tên lớp</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Số học sinh</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Ngày tạo</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredClasses.map((cls) => (
                  <tr key={cls.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm font-bold text-gray-900">{cls.name}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{cls.students?.length || 0} học sinh</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{new Date(cls.created_at).toLocaleDateString()}</td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button onClick={() => deleteItem(cls.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">ID</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Câu hỏi</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Trạng thái</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredQuestions.map((q) => (
                  <tr key={q.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm text-gray-500 font-mono">{q.id}</td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900 max-w-md truncate">{q.question}</td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${q.is_answered ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {q.is_answered ? 'Đã dùng' : 'Chưa dùng'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button onClick={() => deleteItem(q.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
