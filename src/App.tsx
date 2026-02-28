import React, { useState, useEffect, useRef } from 'react';
import { Camera, Image as ImageIcon, History, Trash2, ChevronLeft, ChevronRight, Plus, X, Check, Save, Info, Settings, Download, Upload, Folder, FolderPlus, Edit3, LayoutGrid, Layers, Disc } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import confetti from 'canvas-confetti';

interface Project {
  id: number;
  name: string;
  description: string;
  summary?: string;
  status?: 'active' | 'archived';
  latest_photo?: string;
  created_at: string;
}

interface Photo {
  id: number;
  project_id: number;
  filename: string;
  original_date: string;
  caption: string;
  created_at: string;
}

export default function App() {
  const [appTitle, setAppTitle] = useState(() => localStorage.getItem('app_title') || "OCEAN'S CHRONICLE");
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [view, setView] = useState<'projects' | 'gallery' | 'camera' | 'timeline' | 'settings'>('projects');
  const [galleryMode, setGalleryMode] = useState<'stack' | 'vinyl' | 'grid'>('stack');
  const [loading, setLoading] = useState(true);
  const [storageInfo, setStorageInfo] = useState<{ count: number; size: string }>({ count: 0, size: '0 B' });
  const [isFlashing, setIsFlashing] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [archiveSummary, setArchiveSummary] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [editingCaption, setEditingCaption] = useState<string>('');
  
  const [isSaving, setIsSaving] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  
  // Camera & Preview State
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);

  // Camera refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    localStorage.setItem('app_title', appTitle);
  }, [appTitle]);

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    if (currentProject) {
      fetchPhotos(currentProject.id);
    }
  }, [currentProject]);

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      setProjects(data);
      // Sync current project if one is selected
      if (currentProject) {
        const updated = data.find((p: Project) => p.id === currentProject.id);
        if (updated) setCurrentProject(updated);
      }
    } catch (err) {
      console.error('Failed to fetch projects', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPhotos = async (projectId: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/photos?project_id=${projectId}`);
      const data = await res.json();
      setPhotos(data);
    } catch (err) {
      console.error('Failed to fetch photos', err);
    } finally {
      setLoading(false);
    }
  };

  const createProject = async () => {
    if (!newProjectName.trim()) return;
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newProjectName }),
      });
      if (res.ok) {
        const project = await res.json();
        setProjects([project, ...projects]);
        setNewProjectName('');
        setShowNewProjectModal(false);
        setCurrentProject(project);
        setView('gallery');
      } else {
        const error = await res.text();
        alert(`Failed to create project: ${error}`);
      }
    } catch (err) {
      console.error('Failed to create project', err);
      alert('Failed to create project. Please check your connection.');
    }
  };

  const deleteProject = async (id: number) => {
    if (!confirm('确定要删除整个项目及其所有照片吗？此操作不可恢复。')) return;
    try {
      const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setProjects(projects.filter(p => p.id !== id));
        if (currentProject?.id === id) setCurrentProject(null);
        setView('projects');
      }
    } catch (err) {
      console.error('Delete project failed', err);
    }
  };

  const startCamera = async () => {
    setView('camera');
    setPreviewImage(null);
    setPreviewBlob(null);
    setIsCameraActive(false);
  };

  // Effect to handle camera stream when view changes to 'camera'
  useEffect(() => {
    let activeStream: MediaStream | null = null;

    const initCamera = async () => {
      if (view === 'camera' && !previewImage) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } 
          });
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            streamRef.current = stream;
            activeStream = stream;
          }
        } catch (err) {
          console.error('Camera access error:', err);
          alert('无法访问摄像头，请检查权限设置。');
          setView('gallery');
        }
      }
    };

    initCamera();

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [view, previewImage]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  const handleCapture = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    if (!context) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    setPreviewImage(dataUrl);
    canvas.toBlob((blob) => setPreviewBlob(blob), 'image/jpeg', 0.7);
    
    // Visual feedback
    setIsFlashing(true);
    setTimeout(() => setIsFlashing(false), 150);
  };

  const compressImage = (base64Str: string): Promise<Blob> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        // Max dimension 1600px for good balance of quality/size
        const MAX_DIM = 1600;
        if (width > height && width > MAX_DIM) {
          height *= MAX_DIM / width;
          width = MAX_DIM;
        } else if (height > MAX_DIM) {
          width *= MAX_DIM / height;
          height = MAX_DIM;
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        
        // Compress to JPEG with 0.8 quality
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
        }, 'image/jpeg', 0.8);
      };
    });
  };

  const savePhoto = async () => {
    if (!previewImage || !currentProject || isSaving) return;
    setIsSaving(true);
    try {
      // Small delay to let UI update before heavy compression
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Compress before upload
      const compressedBlob = await compressImage(previewImage);
      const formData = new FormData();
      formData.append('image', compressedBlob, 'capture.jpg');
      formData.append('project_id', currentProject.id.toString());
      formData.append('original_date', new Date().toISOString());
      formData.append('caption', '');

      const res = await fetch('/api/photos', {
        method: 'POST',
        body: formData,
      });
      
      if (res.ok) {
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        
        // Reset states first
        setPreviewImage(null);
        setPreviewBlob(null);
        stopCamera();
        
        // Update local state
        await Promise.all([
          fetchPhotos(currentProject.id),
          fetchProjects()
        ]);
        
        // Return to gallery
        setView('gallery');
      } else {
        const error = await res.text();
        alert(`Failed to save photo: ${error}`);
      }
    } catch (err) {
      console.error('Upload failed', err);
      alert('Failed to save photo. Please check your connection.');
    } finally {
      setIsSaving(false);
    }
  };

  const deletePhoto = async (id: number) => {
    if (!confirm('确定要删除这张珍贵的记录吗？')) return;
    try {
      const res = await fetch(`/api/photos/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setPhotos(photos.filter(p => p.id !== id));
        if (selectedPhoto?.id === id) setSelectedPhoto(null);
      }
    } catch (err) {
      console.error('Delete failed', err);
    }
  };

  const exportBackup = () => { window.location.href = '/api/backup/export'; };

  const importBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !confirm('导入备份将覆盖当前所有数据，确定继续吗？')) return;
    const formData = new FormData();
    formData.append('backup', file);
    try {
      setLoading(true);
      const res = await fetch('/api/backup/import', { method: 'POST', body: formData });
      if (res.ok) { alert('导入成功，应用将刷新'); window.location.reload(); }
      else { alert('导入失败'); }
    } catch (err) { console.error('Import failed', err); }
    finally { setLoading(false); }
  };

  const updatePhotoCaption = async (id: number, caption: string) => {
    try {
      const res = await fetch(`/api/photos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caption }),
      });
      if (res.ok) {
        setPhotos(photos.map(p => p.id === id ? { ...p, caption } : p));
      }
    } catch (err) {
      console.error('Update caption failed', err);
    }
  };

  const finalizeProject = async () => {
    if (!currentProject) return;
    try {
      const res = await fetch(`/api/projects/${currentProject.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary: archiveSummary, status: 'archived' }),
      });
      if (res.ok) {
        setCurrentProject({ ...currentProject, summary: archiveSummary, status: 'archived' });
        setProjects(projects.map(p => p.id === currentProject.id ? { ...p, summary: archiveSummary, status: 'archived' } : p));
        setShowArchiveModal(false);
        setArchiveSummary('');
      }
    } catch (err) {
      console.error('Finalize failed', err);
    }
  };

  const lastPhoto = photos.length > 0 ? photos[0] : null;

  return (
    <div className="min-h-screen flex flex-col max-w-md mx-auto bg-brand-bg shadow-2xl relative overflow-hidden border-x border-brand-accent/10">
      {/* Saving Overlay */}
      <AnimatePresence>
        {isSaving && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-brand-bg/90 backdrop-blur-md flex flex-col items-center justify-center gap-6"
          >
            <div className="w-16 h-16 border-2 border-brand-accent/20 border-t-brand-accent rounded-full animate-spin" />
            <div className="text-center space-y-2">
              <h2 className="classical-title text-2xl text-brand-ink">Preserving Moment</h2>
              <p className="text-[10px] font-sans uppercase tracking-[0.3em] text-brand-muted animate-pulse">Optimizing for Eternity...</p>
            </div>
            <div className="ornament scale-75" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header - Classical Style */}
      <header className="p-10 pb-6 flex flex-col items-center gap-6 z-10">
        <div className="flex flex-col items-center text-center">
          <div onClick={() => setView('projects')} className="cursor-pointer group space-y-2">
            <h1 className="classical-title text-4xl text-brand-ink tracking-tight uppercase">
              {appTitle}
            </h1>
            <div className="ornament" />
          </div>
          <div className="flex gap-4 mt-2">
            <button onClick={() => setView('settings')} className="text-brand-muted hover:text-brand-accent transition-colors">
              <Settings size={18} />
            </button>
            <button onClick={() => setShowGuide(!showGuide)} className="text-brand-muted hover:text-brand-accent transition-colors">
              <Info size={18} />
            </button>
          </div>
        </div>
        <div className="w-full flex justify-between items-center border-y border-brand-accent/10 py-3">
          <p className="text-[10px] font-sans uppercase tracking-[0.3em] text-brand-muted">
            {view === 'projects' ? 'Archives Index' : currentProject?.name}
          </p>
          <p className="text-[10px] font-sans uppercase tracking-[0.3em] text-brand-muted">
            {format(new Date(), 'MMMM dd, yyyy')}
          </p>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pb-32">
        <AnimatePresence mode="wait">
          {view === 'projects' && (
            <motion.div key="projects" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-8 space-y-12">
              <div className="grid grid-cols-1 gap-12">
                {projects.map((project, idx) => (
                  <motion.div 
                    key={project.id}
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: idx * 0.1 }}
                    className="group cursor-pointer"
                    onClick={() => { setCurrentProject(project); setView('gallery'); }}
                    style={{ rotate: idx % 2 === 0 ? '0.5deg' : '-0.5deg' }}
                    whileHover={{ rotate: 0, scale: 1.02, transition: { duration: 0.3 } }}
                  >
                    <div className="classical-card overflow-hidden shadow-xl group-hover:shadow-2xl transition-all duration-500 flex flex-col bg-white">
                      {/* Image Area */}
                      <div className="relative aspect-[4/3] overflow-hidden p-3 pb-0">
                        <div className="w-full h-full overflow-hidden rounded-sm relative">
                          {project.latest_photo ? (
                            <img 
                              src={`/uploads/${project.latest_photo}`} 
                              className="w-full h-full object-cover sepia-[0.1] group-hover:sepia-0 group-hover:scale-105 transition-all duration-1000"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-full h-full bg-brand-accent/5 flex items-center justify-center">
                              <ImageIcon size={48} className="text-brand-accent/20" />
                            </div>
                          )}
                          
                          {project.status === 'archived' && (
                            <div className="absolute inset-0 bg-brand-ink/40 flex items-center justify-center backdrop-blur-[1px]">
                              <span className="text-[10px] font-sans uppercase tracking-[0.5em] text-white border border-white/30 px-4 py-2">Archived</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Content Area */}
                      <div className="p-8 pt-6 space-y-4 text-center">
                        <div className="flex items-center justify-center gap-4">
                          <div className="h-px flex-1 bg-brand-accent/10" />
                          <span className="text-[9px] font-sans uppercase tracking-[0.4em] text-brand-accent font-medium">
                            Folio {String(idx + 1).padStart(2, '0')}
                          </span>
                          <div className="h-px flex-1 bg-brand-accent/10" />
                        </div>

                        <div className="space-y-2">
                          <h3 className="classical-title text-3xl text-brand-ink group-hover:text-brand-accent transition-colors duration-500">
                            {project.name}
                          </h3>
                          <div className="flex items-center justify-center gap-3 text-[10px] italic text-brand-muted">
                            <span>{format(new Date(project.created_at), 'MMMM yyyy')}</span>
                            <span className="w-1 h-1 rounded-full bg-brand-accent/30" />
                            <span>{project.status === 'archived' ? 'Completed' : 'In Progress'}</span>
                          </div>
                        </div>

                        <div className="ornament scale-50 opacity-40 group-hover:opacity-100 group-hover:scale-75 transition-all duration-700" />
                      </div>
                    </div>
                  </motion.div>
                ))}
                
                <motion.button 
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowNewProjectModal(true)}
                  className="w-full py-16 border-2 border-dashed border-brand-accent/20 rounded-sm flex flex-col items-center justify-center gap-4 text-brand-muted hover:bg-white hover:border-brand-accent/40 transition-all duration-500 group"
                >
                  <div className="w-12 h-12 rounded-full border border-brand-accent/20 flex items-center justify-center group-hover:border-brand-accent transition-colors">
                    <Plus size={24} className="opacity-40 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <span className="text-[10px] font-sans uppercase tracking-[0.4em]">Initialize New Archive</span>
                </motion.button>
              </div>
            </motion.div>
          )}

          {view === 'gallery' && currentProject && (
            <motion.div key="gallery" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-10 space-y-10">
              <div className="flex flex-col items-center gap-6 text-center">
                <button onClick={() => setView('projects')} className="text-[10px] font-sans uppercase tracking-[0.3em] text-brand-muted hover:text-brand-accent transition-colors">
                  Return to Index
                </button>
                
                <div className="flex items-center gap-8">
                  <button 
                    onClick={() => setGalleryMode('stack')}
                    className={`p-2 transition-all ${galleryMode === 'stack' ? 'text-brand-accent scale-110' : 'text-brand-muted opacity-40 hover:opacity-100'}`}
                    title="Time Stack"
                  >
                    <Layers size={18} />
                  </button>
                  <button 
                    onClick={() => setGalleryMode('vinyl')}
                    className={`p-2 transition-all ${galleryMode === 'vinyl' ? 'text-brand-accent scale-110' : 'text-brand-muted opacity-40 hover:opacity-100'}`}
                    title="Vinyl Rack"
                  >
                    <Disc size={18} />
                  </button>
                  <button 
                    onClick={() => setGalleryMode('grid')}
                    className={`p-2 transition-all ${galleryMode === 'grid' ? 'text-brand-accent scale-110' : 'text-brand-muted opacity-40 hover:opacity-100'}`}
                    title="Dense Archive"
                  >
                    <LayoutGrid size={18} />
                  </button>
                </div>

                {(!currentProject?.status || currentProject.status === 'active') ? (
                  <button 
                    onClick={() => setShowArchiveModal(true)}
                    className="text-[9px] font-sans uppercase tracking-[0.2em] text-brand-accent border border-brand-accent/20 px-4 py-2 hover:bg-brand-accent hover:text-white transition-all"
                  >
                    Finalize Archive
                  </button>
                ) : (
                  <div className="max-w-xs mx-auto">
                    <p className="text-[10px] italic text-brand-muted leading-relaxed">"{currentProject?.summary || 'This archive has been preserved for eternity.'}"</p>
                  </div>
                )}

                <div className="ornament scale-75" />
                <span className="text-xs italic text-brand-muted">
                  {photos.length} Captured Moments
                </span>
              </div>

              {loading ? (
                <div className="flex justify-center py-20"><div className="animate-pulse text-brand-accent font-display italic">Loading Archives...</div></div>
              ) : photos.length === 0 ? (
                <div className="text-center py-20 space-y-8">
                  <p className="text-lg italic text-brand-muted">The archive is currently empty.</p>
                  <button onClick={startCamera} className="classical-btn">Begin Recording</button>
                </div>
              ) : (
                <div className="min-h-[500px] flex items-center justify-center">
                  {galleryMode === 'stack' && (
                    <div className="relative w-full h-[500px] flex items-center overflow-x-auto overflow-y-hidden px-20 no-scrollbar snap-x snap-mandatory">
                      <div className="flex items-center py-10">
                        {photos.map((photo, idx) => (
                          <motion.div
                            layoutId={`photo-${photo.id}`}
                            key={photo.id}
                            onClick={() => setSelectedPhoto(photo)}
                            initial={{ x: 50, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            transition={{ delay: idx * 0.05 }}
                            className="relative flex-shrink-0 w-64 -ml-32 first:ml-0 snap-center cursor-pointer group"
                            style={{ 
                              zIndex: idx,
                              rotate: idx % 2 === 0 ? '2deg' : '-2deg'
                            }}
                            whileHover={{ 
                              zIndex: 100, 
                              scale: 1.05, 
                              rotate: 0,
                              y: -20,
                              transition: { duration: 0.3 } 
                            }}
                          >
                            <div className="aspect-[3/4] overflow-hidden classical-card p-2 shadow-2xl">
                              <img 
                                src={`/uploads/${photo.filename}`} 
                                className="w-full h-full object-cover sepia-[0.3] group-hover:sepia-0 transition-all duration-1000"
                                referrerPolicy="no-referrer"
                              />
                            </div>
                            <div className="absolute -bottom-12 left-0 right-0 text-center opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                              <p className="text-[10px] font-sans uppercase tracking-widest text-brand-muted">Entry {String(idx + 1).padStart(3, '0')}</p>
                              <p className="text-[10px] italic text-brand-ink/60">{format(new Date(photo.original_date), 'MMM dd, yyyy')}</p>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  )}

                  {galleryMode === 'vinyl' && (
                    <div className="relative w-full h-[500px] flex items-center overflow-x-auto overflow-y-hidden px-20 no-scrollbar snap-x snap-mandatory perspective-[1000px]">
                      <div className="flex items-center gap-1 py-10">
                        {photos.map((photo, idx) => (
                          <motion.div
                            layoutId={`photo-${photo.id}`}
                            key={photo.id}
                            onClick={() => setSelectedPhoto(photo)}
                            initial={{ x: 100, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            transition={{ delay: idx * 0.02 }}
                            className="relative flex-shrink-0 w-12 snap-center cursor-pointer group"
                            style={{ transformStyle: 'preserve-3d' }}
                            whileHover={{ 
                              width: '200px',
                              marginRight: '20px',
                              transition: { duration: 0.4, ease: "circOut" } 
                            }}
                          >
                            {/* Spine View */}
                            <div className="absolute inset-0 bg-brand-ink/90 border-r border-white/10 flex flex-col items-center justify-end py-8 group-hover:opacity-0 transition-opacity duration-300">
                              <p className="text-[8px] font-sans uppercase tracking-[0.2em] text-white/40 vertical-text">
                                {format(new Date(photo.original_date), 'yyyy.MM.dd')}
                              </p>
                            </div>
                            
                            {/* Full Cover View (Revealed on hover) */}
                            <div className="w-48 aspect-square overflow-hidden classical-card p-2 shadow-2xl bg-brand-bg opacity-0 group-hover:opacity-100 transition-opacity duration-500 scale-90 group-hover:scale-100">
                              <img 
                                src={`/uploads/${photo.filename}`} 
                                className="w-full h-full object-cover transition-all duration-700"
                                referrerPolicy="no-referrer"
                              />
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  )}

                  {galleryMode === 'grid' && (
                    <div className="w-full grid grid-cols-5 gap-2">
                      {photos.map((photo, idx) => (
                        <motion.div
                          layoutId={`photo-${photo.id}`}
                          key={photo.id}
                          onClick={() => setSelectedPhoto(photo)}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: (idx % 20) * 0.02 }}
                          className="aspect-square overflow-hidden cursor-pointer group relative"
                        >
                          <img 
                            src={`/uploads/${photo.filename}`} 
                            className="w-full h-full object-cover sepia-[0.4] group-hover:sepia-0 transition-all duration-500"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute inset-0 bg-brand-accent/0 group-hover:bg-brand-accent/10 transition-colors" />
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {view === 'camera' && (
            <motion.div key="camera" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-brand-bg flex flex-col">
              <div className="relative flex-1 overflow-hidden flex items-center justify-center p-10">
                {!previewImage ? (
                  <div className="relative w-full h-full classical-card p-4 overflow-hidden bg-brand-ink/5 flex items-center justify-center">
                    <video 
                      ref={videoRef} 
                      autoPlay 
                      playsInline 
                      onPlaying={() => setIsCameraActive(true)}
                      className={`w-full h-full object-cover sepia-[0.2] transition-opacity duration-700 ${isCameraActive ? 'opacity-100' : 'opacity-0'}`} 
                    />
                    <canvas ref={canvasRef} className="hidden" />
                    
                    {!isCameraActive && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                        <div className="w-8 h-8 border-2 border-brand-accent/20 border-t-brand-accent rounded-full animate-spin" />
                        <p className="text-[9px] font-sans uppercase tracking-[0.2em] text-brand-muted">Initializing Lens...</p>
                      </div>
                    )}
                    
                    {/* Flash Effect */}
                    <AnimatePresence>
                      {isFlashing && (
                        <motion.div 
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="absolute inset-0 bg-white z-20"
                        />
                      )}
                    </AnimatePresence>
                    
                    {/* Classical Overlays */}
                    <div className="absolute inset-8 border border-brand-accent/20 pointer-events-none z-10" />
                    <div className="absolute top-1/2 left-0 right-0 h-px bg-brand-accent/10 pointer-events-none z-10" />
                    <div className="absolute top-0 bottom-0 left-1/2 w-px bg-brand-accent/10 pointer-events-none z-10" />

                    {lastPhoto && isCameraActive && (
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.2 }}
                        className="absolute inset-4 pointer-events-none mix-blend-multiply z-10"
                      >
                        <img src={`/uploads/${lastPhoto.filename}`} className="w-full h-full object-cover sepia" referrerPolicy="no-referrer" />
                      </motion.div>
                    )}

                    <button onClick={() => { stopCamera(); setView('gallery'); }} className="absolute top-8 left-8 p-3 bg-brand-ink text-white rounded-sm z-20">
                      <X size={20} />
                    </button>

                    <div className="absolute bottom-12 left-0 right-0 flex justify-center items-center z-20">
                      <button 
                        onClick={handleCapture} 
                        disabled={!isCameraActive}
                        className={`w-20 h-20 rounded-full border border-brand-accent flex items-center justify-center p-1 group transition-opacity ${!isCameraActive ? 'opacity-50 cursor-not-allowed' : 'opacity-100'}`}
                      >
                        <div className="w-full h-full rounded-full bg-brand-accent/20 group-active:bg-brand-accent transition-colors" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="relative w-full h-full classical-card p-4 overflow-hidden">
                    <img src={previewImage} className="w-full h-full object-cover" />
                    <div className="absolute bottom-12 left-0 right-0 flex justify-center items-center gap-12 px-10">
                      <button 
                        onClick={() => setPreviewImage(null)} 
                        className="text-[10px] font-sans uppercase tracking-widest text-brand-muted underline underline-offset-8"
                        disabled={isSaving}
                      >
                        Discard
                      </button>
                      <button onClick={savePhoto} disabled={isSaving} className="classical-btn">
                        {isSaving ? 'Preserving...' : 'Preserve'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {view === 'settings' && (
            <motion.div key="settings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-10 space-y-12">
              <div className="flex flex-col items-center text-center gap-6">
                <button onClick={() => setView('projects')} className="p-3 border border-brand-accent/20 rounded-sm text-brand-muted">
                  <ChevronLeft size={20} />
                </button>
                <h2 className="classical-title text-3xl">Archive Configuration</h2>
                <div className="ornament scale-75" />
              </div>

              <div className="space-y-12">
                <div className="classical-card p-6 space-y-4 bg-brand-accent/5">
                  <p className="text-[10px] font-sans uppercase tracking-widest text-brand-muted">Storage Status</p>
                  <div className="flex justify-between items-end">
                    <div className="space-y-1">
                      <p className="text-2xl font-display italic text-brand-ink">{photos.length}</p>
                      <p className="text-[8px] font-sans uppercase tracking-tighter text-brand-muted">Total Moments</p>
                    </div>
                    <div className="text-right space-y-1">
                      <p className="text-sm font-sans text-brand-ink">Cloud Optimized</p>
                      <p className="text-[8px] font-sans uppercase tracking-tighter text-brand-accent">Compression Active</p>
                    </div>
                  </div>
                  <div className="w-full h-px bg-brand-accent/10" />
                  <p className="text-[9px] italic text-brand-muted leading-relaxed">
                    您的照片已通过智能算法优化，在保持清晰的同时大幅节省了云端空间。建议定期导出备份以确保数据永久安全。
                  </p>
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-sans uppercase tracking-[0.3em] text-brand-muted">Archive Title</label>
                  <div className="flex flex-col gap-4">
                    <input 
                      type="text" 
                      value={appTitle} 
                      onChange={(e) => setAppTitle(e.target.value.toUpperCase())}
                      className="w-full p-4 bg-white border border-brand-accent/20 rounded-sm outline-none focus:border-brand-accent transition-colors font-display italic text-xl text-brand-ink"
                    />
                    <button 
                      onClick={() => {
                        localStorage.setItem('app_title', appTitle);
                        alert('Title updated successfully.');
                      }} 
                      className="classical-btn w-full"
                    >
                      Confirm Title
                    </button>
                  </div>
                </div>

                <div className="space-y-8">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 text-brand-accent">
                      <Download size={18} />
                      <h3 className="text-[10px] font-sans uppercase tracking-widest">Preservation</h3>
                    </div>
                    <button onClick={exportBackup} className="w-full classical-btn">Export Archive ZIP</button>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center gap-3 text-brand-muted">
                      <Upload size={18} />
                      <h3 className="text-[10px] font-sans uppercase tracking-widest">Restoration</h3>
                    </div>
                    <label className="block w-full py-3 border border-brand-accent/20 text-brand-muted rounded-sm text-[10px] font-sans uppercase tracking-widest text-center cursor-pointer hover:bg-white transition-colors">
                      Import Archive ZIP
                      <input type="file" accept=".zip" onChange={importBackup} className="hidden" />
                    </label>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {view === 'timeline' && (
            <motion.div key="timeline" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-10 space-y-16">
              <div className="flex flex-col items-center gap-4 text-center">
                <button onClick={() => setView('gallery')} className="text-[10px] font-sans uppercase tracking-[0.3em] text-brand-muted hover:text-brand-accent transition-colors">
                  Return to Gallery
                </button>
                <div className="ornament scale-75" />
                <span className="text-xs italic text-brand-muted">
                  Chronological Progression
                </span>
              </div>

              <div className="space-y-24 relative">
                {photos.map((photo, idx) => (
                  <div key={photo.id} className="time-marker">
                    <div className="space-y-6">
                      <div className="flex justify-between items-baseline">
                        <p className="text-[10px] font-sans uppercase tracking-[0.2em] text-brand-accent">
                          {format(new Date(photo.original_date), 'MMMM dd, yyyy')}
                        </p>
                        <span className="text-[10px] italic text-brand-muted">Folio {String(photos.length - idx).padStart(3, '0')}</span>
                      </div>
                      <div className="classical-card p-3">
                        <img 
                          src={`/uploads/${photo.filename}`} 
                          className="w-full h-full object-cover sepia-[0.2] hover:sepia-0 transition-all duration-1000"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <div className="text-center">
                        <div className="ornament scale-50 opacity-20" />
                        <p className="font-serif italic text-sm text-brand-ink/60">
                          Captured in the month of {format(new Date(photo.original_date), 'MMMM', { locale: zhCN })}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* New Project Modal */}
      <AnimatePresence>
        {showNewProjectModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-brand-bg/95 backdrop-blur-sm flex items-center justify-center p-10">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="w-full classical-card p-10 space-y-10 text-center">
              <h3 className="classical-title text-3xl text-brand-ink">New Archive</h3>
              <div className="ornament" />
              <div className="space-y-4">
                <label className="text-[10px] font-sans text-brand-muted uppercase tracking-[0.3em]">Archive Name</label>
                <input 
                  type="text" 
                  value={newProjectName}
                  onChange={e => setNewProjectName(e.target.value)}
                  className="w-full p-4 bg-transparent border-b border-brand-accent/30 outline-none text-2xl font-display italic text-center"
                  autoFocus
                />
              </div>
              <div className="flex gap-8">
                <button onClick={() => setShowNewProjectModal(false)} className="flex-1 py-4 text-brand-muted font-sans text-[10px] uppercase tracking-widest">Cancel</button>
                <button onClick={createProject} className="flex-1 classical-btn">Create</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation Bar - Classical */}
      {view !== 'camera' && view !== 'settings' && (
        <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto p-10 z-20">
          <div className="bg-white/80 backdrop-blur-md border border-brand-accent/10 p-2 rounded-sm flex justify-around items-center shadow-lg">
            <button onClick={() => setView('projects')} className={`p-4 transition-all ${view === 'projects' ? 'text-brand-accent' : 'text-brand-muted hover:text-brand-ink'}`}>
              <Folder size={20} />
            </button>
            <button onClick={startCamera} className="w-16 h-16 bg-brand-ink rounded-full flex items-center justify-center text-white shadow-xl active:scale-90 transition-all">
              <Plus size={28} />
            </button>
            <button onClick={() => setView('timeline')} className={`p-4 transition-all ${view === 'timeline' ? 'text-brand-accent' : 'text-brand-muted hover:text-brand-ink'}`}>
              <History size={20} />
            </button>
          </div>
        </nav>
      )}

      {/* Photo Detail Modal */}
      <AnimatePresence>
        {selectedPhoto && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-brand-bg flex flex-col">
            <div className="relative flex-1 flex items-center justify-center p-10">
              <div className="classical-card w-full h-full relative p-4 bg-white">
                <motion.img 
                  layoutId={`photo-${selectedPhoto.id}`}
                  src={`/uploads/${selectedPhoto.filename}`} 
                  className="w-full h-full object-contain"
                  referrerPolicy="no-referrer"
                />
                <button onClick={() => { setSelectedPhoto(null); setEditingCaption(''); }} className="absolute top-8 left-8 p-3 bg-brand-ink text-white rounded-sm">
                  <ChevronLeft size={20} />
                </button>
                <button onClick={() => deletePhoto(selectedPhoto.id)} className="absolute top-8 right-8 p-3 bg-brand-bg border border-brand-accent/20 text-brand-accent rounded-sm">
                  <Trash2 size={20} />
                </button>
              </div>
            </div>
            <div className="p-12 space-y-10 bg-white border-t border-brand-accent/10 text-center">
              <div className="space-y-4">
                <p className="text-[10px] font-sans uppercase tracking-[0.4em] text-brand-muted">
                  {format(new Date(selectedPhoto.original_date), 'dd MMMM yyyy')}
                </p>
                <div className="relative group max-w-xs mx-auto">
                  <textarea
                    value={editingCaption !== '' ? editingCaption : (selectedPhoto.caption || '')}
                    onChange={(e) => setEditingCaption(e.target.value)}
                    onBlur={() => {
                      if (editingCaption !== '') {
                        updatePhotoCaption(selectedPhoto.id, editingCaption);
                      }
                    }}
                    placeholder="记录这一刻的心情..."
                    className="w-full bg-transparent border-none text-center text-sm italic text-brand-ink focus:ring-0 resize-none h-20 placeholder:text-brand-muted/30"
                  />
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-px bg-brand-accent/20" />
                </div>
                <div className="ornament scale-75" />
                <p className="font-serif italic text-lg text-brand-muted">Archive: {currentProject?.name}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Archive Summary Modal */}
      <AnimatePresence>
        {showArchiveModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-brand-ink/40 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-sm bg-brand-bg p-10 space-y-8 shadow-2xl border border-brand-accent/10"
            >
              <div className="text-center space-y-4">
                <h2 className="classical-title text-2xl">Finalize Archive</h2>
                <div className="ornament" />
                <p className="text-[10px] font-sans uppercase tracking-widest text-brand-muted">Write a summary for this volume</p>
              </div>
              <textarea
                value={archiveSummary}
                onChange={(e) => setArchiveSummary(e.target.value)}
                placeholder="为这段时光写下总结..."
                className="w-full h-40 bg-brand-accent/5 border border-brand-accent/10 p-4 text-sm italic text-brand-ink focus:ring-0 focus:border-brand-accent/30 resize-none"
              />
              <div className="flex gap-4">
                <button onClick={() => setShowArchiveModal(false)} className="flex-1 py-3 text-[10px] font-sans uppercase tracking-widest text-brand-muted border border-brand-accent/10">Cancel</button>
                <button onClick={finalizeProject} className="flex-1 py-3 text-[10px] font-sans uppercase tracking-widest bg-brand-accent text-white">Complete</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
