import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  MessageSquare,
  Heart,
  Copy,
  Check,
  Mail,
  Send,
  Paperclip,
  Trash2,
  AlertCircle,
  Sparkles,
  ExternalLink,
  Coins,
  ShieldCheck,
  CheckCircle2,
  Download,
} from 'lucide-react';

interface FeedbackDonationModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'feedback' | 'donation';
}

interface AttachedImage {
  id: string;
  name: string;
  dataUrl: string;
  size: number;
}

const TON_ADDRESS = 'UQBL6WfzOITTHkFjFkKaxJcEH191mKPomK6otxMoq4Za_w1Jo';
const TRC20_ADDRESS = 'TYeQrerTaXWfyn4rTbkSF7UhyQ75CrH1kc';
const FEEDBACK_EMAIL = 'virus.dev.adm@gmail.com';
const TELEGRAM_USERNAME = 'madness_ua';

export const FeedbackDonationModal: React.FC<FeedbackDonationModalProps> = ({
  isOpen,
  onClose,
  defaultTab = 'feedback',
}) => {
  const [activeTab, setActiveTab] = useState<'feedback' | 'donation'>(defaultTab);
  const [cryptoNetwork, setCryptoNetwork] = useState<'TON' | 'TRC20'>('TON');
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Feedback form state
  const [category, setCategory] = useState<'suggestion' | 'bug' | 'algorithm' | 'other'>('suggestion');
  const [contact, setContact] = useState('');
  const [isContactTouched, setIsContactTouched] = useState(false);
  const [message, setMessage] = useState('');
  const [screenshots, setScreenshots] = useState<AttachedImage[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(defaultTab);
    }
  }, [isOpen, defaultTab]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Handle pasting images from clipboard
  useEffect(() => {
    if (!isOpen || activeTab !== 'feedback') return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            addImageFile(file);
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen, activeTab]);

  if (!isOpen) return null;

  const showToast = (text: string) => {
    setStatusNotice(text);
    setTimeout(() => setStatusNotice(null), 3500);
  };

  const handleCopy = (text: string, fieldId: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    showToast(`✓ ${label} скопирован в буфер обмена`);
    setTimeout(() => {
      setCopiedField((prev) => (prev === fieldId ? null : prev));
    }, 2500);
  };

  const addImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      showToast('Можно прикреплять только изображения (PNG, JPG, WebP)');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('Размер файла не должен превышать 5 МБ');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const newImg: AttachedImage = {
        id: `img_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: file.name || `Скриншот ${screenshots.length + 1}.png`,
        dataUrl: reader.result as string,
        size: file.size,
      };
      setScreenshots((prev) => [...prev, newImg]);
      showToast('Скриншот прикреплен');
    };
    reader.readAsDataURL(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      Array.from(e.target.files).forEach(addImageFile);
    }
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      Array.from(e.dataTransfer.files).forEach(addImageFile);
    }
  };

  const removeScreenshot = (id: string) => {
    setScreenshots((prev) => prev.filter((img) => img.id !== id));
  };

  const copyImageToClipboard = async (img: AttachedImage) => {
    try {
      const res = await fetch(img.dataUrl);
      const blob = await res.blob();
      let imageBlob = blob;
      if (blob.type !== 'image/png') {
        const image = new Image();
        image.src = img.dataUrl;
        await new Promise((resolve) => {
          image.onload = resolve;
        });
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(image, 0, 0);
        const pngBlob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, 'image/png')
        );
        if (pngBlob) imageBlob = pngBlob;
      }
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': imageBlob }),
      ]);
      showToast(`Картинка «${img.name}» скопирована! Вставьте её через Ctrl+V в чат или письмо.`);
    } catch (err) {
      console.warn('Clipboard image copy failed, downloading instead:', err);
      downloadImage(img);
      showToast(`Файл «${img.name}» сохранен для прикрепления.`);
    }
  };

  const downloadImage = (img: AttachedImage) => {
    const a = document.createElement('a');
    a.href = img.dataUrl;
    a.download = img.name || 'screenshot.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast(`Файл «${img.name}» сохранен`);
  };

  const validateContact = (val: string): { isValid: boolean; error?: string } => {
    const clean = val.trim();
    if (!clean) {
      return { isValid: false, error: 'Обязательное поле: укажите Telegram (@username) или Email' };
    }

    // 1. Email check: user@domain.tld
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (emailRegex.test(clean)) {
      return { isValid: true };
    }

    // 2. Telegram handle check: @user, user, t.me/user
    const tgClean = clean.replace(/^(https?:\/\/)?t\.me\//, '').replace(/^@/, '');
    const tgRegex = /^[a-zA-Z0-9_]{3,32}$/;
    if (tgRegex.test(tgClean)) {
      return { isValid: true };
    }

    // 3. Phone number check: +380..., +7...
    const phoneRegex = /^\+?[0-9\s\-()]{7,20}$/;
    if (phoneRegex.test(clean)) {
      return { isValid: true };
    }

    return {
      isValid: false,
      error: 'Укажите корректный Telegram (@username) или адрес Email (name@domain.com)',
    };
  };

  const contactValidation = validateContact(contact);
  const isContactValid = contactValidation.isValid;

  const validateFormBeforeSend = (): boolean => {
    setIsContactTouched(true);
    if (!isContactValid) {
      showToast(contactValidation.error || 'Укажите контакт для связи (Telegram или Email)');
      return false;
    }
    if (!message.trim()) {
      showToast('Пожалуйста, напишите текст сообщения перед отправкой');
      return false;
    }
    return true;
  };

  const getCategoryTitle = () => {
    switch (category) {
      case 'suggestion':
        return 'Идея / Предложение по функционалу';
      case 'bug':
        return 'Сообщение об ошибке в работе';
      case 'algorithm':
        return 'Вопрос по расчету или алгоритму';
      case 'other':
        return 'Обратная связь';
    }
  };

  const buildFeedbackText = () => {
    const lines = [
      `[Линейный Раскрой Про] — ${getCategoryTitle()}`,
      `---------------------------------------`,
      `Категория: ${getCategoryTitle()}`,
      `Контакт автора: ${contact.trim()}`,
      `Дата: ${new Date().toLocaleString('ru-RU')}`,
      `---------------------------------------`,
      `Текст сообщения:`,
      message.trim() || '(текст не указан)',
      `---------------------------------------`,
      screenshots.length > 0
        ? `Прикреплено скриншотов (${screenshots.length} шт.):\n` +
          screenshots
            .map(
              (s, i) =>
                `  • Скриншот ${i + 1}: «${s.name}» (${(s.size / 1024).toFixed(0)} КБ)`
            )
            .join('\n')
        : null,
    ].filter(Boolean);

    return lines.join('\n');
  };

  const openExternalLink = (url: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSendTelegram = () => {
    if (!validateFormBeforeSend()) return;

    const fullText = buildFeedbackText();
    // Copy text to clipboard so user can paste it along with screenshots into Telegram
    navigator.clipboard.writeText(fullText);

    // If screenshots exist, also automatically copy the first screenshot so they can paste it directly
    if (screenshots.length > 0) {
      copyImageToClipboard(screenshots[0]);
    }

    const tgUrl = `https://t.me/${TELEGRAM_USERNAME}`;
    openExternalLink(tgUrl);
    showToast(
      screenshots.length > 0
        ? 'Текст и первый скриншот скопированы! Открываем чат @madness_ua (нажмите Ctrl+V)...'
        : 'Текст скопирован! Открываем чат с @madness_ua в Telegram...'
    );
  };

  const handleOpenGmail = () => {
    if (!validateFormBeforeSend()) return;

    const fullText = buildFeedbackText();
    navigator.clipboard.writeText(fullText);

    if (screenshots.length > 0) {
      copyImageToClipboard(screenshots[0]);
    }

    const subject = encodeURIComponent(`[Линейный Раскрой] ${getCategoryTitle()}`);
    const body = encodeURIComponent(
      fullText +
        (screenshots.length > 0
          ? `\n\n(Внимание: вставьте скопированный скриншот из буфера обмена через Ctrl+V или прикрепите файлы)`
          : '')
    );

    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${FEEDBACK_EMAIL}&su=${subject}&body=${body}`;
    openExternalLink(gmailUrl);
    showToast(
      screenshots.length > 0
        ? 'Черновик Gmail открыт! Текст и скриншот в буфере (нажмите Ctrl+V для вставки)'
        : 'Черновик в Gmail открыт! Текст скопирован в буфер.'
    );
  };

  const handleSendMailto = () => {
    if (!validateFormBeforeSend()) return;

    const fullText = buildFeedbackText();
    navigator.clipboard.writeText(fullText);

    if (screenshots.length > 0) {
      copyImageToClipboard(screenshots[0]);
    }

    const subject = encodeURIComponent(`[Линейный Раскрой] ${getCategoryTitle()}`);
    const body = encodeURIComponent(
      fullText +
        (screenshots.length > 0
          ? `\n\n(Внимание: вставьте скопированный скриншот через Ctrl+V или прикрепите файлы)`
          : '')
    );

    const mailtoUrl = `mailto:${FEEDBACK_EMAIL}?subject=${subject}&body=${body}`;
    openExternalLink(mailtoUrl);
    showToast('Текст скопирован в буфер! Открываем почтовую программу...');
  };

  const handleCopyReport = () => {
    if (!validateFormBeforeSend()) return;
    navigator.clipboard.writeText(buildFeedbackText());
    showToast('✓ Полный текст обращения скопирован в буфер');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Top Header with Title and Close Button */}
        <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between gap-4 shrink-0 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-400 text-slate-950 flex items-center justify-center font-bold shadow-xs">
              {activeTab === 'feedback' ? (
                <MessageSquare className="w-4 h-4 fill-current" />
              ) : (
                <Heart className="w-4 h-4 fill-current text-rose-600" />
              )}
            </div>
            <div>
              <h3 className="text-base font-bold leading-tight text-white">
                {activeTab === 'feedback' ? 'Обратная связь' : 'Поддержать проект'}
              </h3>
              <p className="text-[11px] text-slate-400 leading-tight">
                {activeTab === 'feedback'
                  ? 'Предложения, вопросы и отчеты об ошибках'
                  : 'Крипто-донат на развитие и поддержку сервиса'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            title="Закрыть (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="p-3 bg-slate-100 border-b border-slate-200 shrink-0">
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-200/80 rounded-xl text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveTab('feedback')}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg transition-all cursor-pointer ${
                activeTab === 'feedback'
                  ? 'bg-white text-slate-900 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              <MessageSquare className="w-4 h-4 text-blue-600" />
              <span>Обратная связь</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('donation')}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg transition-all cursor-pointer ${
                activeTab === 'donation'
                  ? 'bg-amber-400 text-slate-950 shadow-xs font-bold'
                  : 'text-slate-700 hover:text-slate-950 hover:bg-amber-300/60'
              }`}
            >
              <Heart className="w-4 h-4 text-rose-600 fill-current" />
              <span>Поддержать проект</span>
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-slate-800 text-sm">
          {/* TAB 1: FEEDBACK */}
          {activeTab === 'feedback' && (
            <div className="space-y-4">
              {/* Category Selector */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Тип обращения
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'suggestion', label: 'Идея / Предложение', icon: '💡' },
                    { id: 'bug', label: 'Ошибка / Баг', icon: '🐛' },
                    { id: 'algorithm', label: 'Вопрос по раскрою', icon: '📐' },
                    { id: 'other', label: 'Другое', icon: '💬' },
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategory(cat.id as any)}
                      className={`flex flex-col items-center justify-center p-2 rounded-xl border text-xs font-medium transition-all cursor-pointer text-center ${
                        category === cat.id
                          ? 'bg-blue-50 border-blue-500 text-blue-900 ring-1 ring-blue-500 shadow-2xs'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <span className="text-base mb-0.5">{cat.icon}</span>
                      <span className="leading-tight">{cat.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Contact info input (Mandatory) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1">
                    <span>Ваш контакт для ответа</span>
                    <span className="text-rose-500 font-black">*</span>
                  </label>
                  <span className="text-[11px] text-slate-400">Telegram (@username) или Email</span>
                </div>

                <div className="relative">
                  <input
                    type="text"
                    value={contact}
                    onFocus={() => setIsContactTouched(true)}
                    onBlur={() => setIsContactTouched(true)}
                    onChange={(e) => {
                      setContact(e.target.value);
                      if (!isContactTouched) setIsContactTouched(true);
                    }}
                    placeholder="@username в Telegram или адрес электронной почты"
                    className={`w-full text-xs px-3 py-2.5 pr-8 rounded-lg transition-all focus:outline-hidden ${
                      isContactTouched && !isContactValid
                        ? 'bg-rose-50/50 border border-rose-400 text-rose-950 focus:ring-2 focus:ring-rose-400 placeholder:text-rose-300'
                        : isContactValid && contact.trim().length > 0
                        ? 'bg-emerald-50/30 border border-emerald-400 text-slate-900 focus:ring-2 focus:ring-emerald-400'
                        : 'bg-slate-50 border border-slate-300 text-slate-900 focus:ring-2 focus:ring-blue-500 focus:bg-white placeholder:text-slate-400'
                    }`}
                  />
                  {contact.trim().length > 0 && (
                    <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                      {isContactValid ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-500" />
                      )}
                    </div>
                  )}
                </div>

                {isContactTouched && !isContactValid && (
                  <p className="mt-1 text-[11px] text-rose-600 font-medium flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{contactValidation.error}</span>
                  </p>
                )}
              </div>

              {/* Message text area */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1">
                    <span>Текст сообщения</span>
                    <span className="text-rose-500 font-black">*</span>
                  </label>
                  <span className="text-[11px] text-slate-400">
                    {message.length > 0 ? `${message.length} симв.` : 'Ctrl+V для вставки скриншота'}
                  </span>
                </div>
                <textarea
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Опишите ваше предложение, замеченную ошибку или приложите параметры раскроя..."
                  className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-900 transition-all placeholder:text-slate-400 resize-y"
                />
              </div>

              {/* Screenshots Attachment Area */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5 text-slate-500" />
                    <span>Скриншоты и изображения</span>
                  </label>
                  <span className="text-[11px] text-slate-400">до 5 МБ каждый</span>
                </div>

                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-3 text-center transition-all cursor-pointer ${
                    isDragging
                      ? 'border-blue-500 bg-blue-50/70 text-blue-700'
                      : 'border-slate-300 hover:border-slate-400 bg-slate-50/50 hover:bg-slate-50 text-slate-600'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <p className="text-xs font-medium">
                    Нажмите для выбора файла, перетащите изображение сюда или нажмите{' '}
                    <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-white border border-slate-300 rounded-md shadow-2xs">
                      Ctrl+V
                    </kbd>
                  </p>
                </div>

                {/* Screenshots Thumbnails */}
                {screenshots.length > 0 && (
                  <div className="mt-3 space-y-2.5">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {screenshots.map((img) => (
                        <div
                          key={img.id}
                          className="group relative rounded-lg border border-slate-200 bg-white overflow-hidden p-1.5 shadow-2xs flex flex-col justify-between"
                        >
                          <div className="h-24 w-full bg-slate-100 rounded-md overflow-hidden flex items-center justify-center relative">
                            <img
                              src={img.dataUrl}
                              alt={img.name}
                              className="max-h-full max-w-full object-contain"
                            />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeScreenshot(img.id);
                              }}
                              className="absolute top-1.5 right-1.5 p-1 bg-slate-900/80 hover:bg-rose-600 text-white rounded-md transition-all cursor-pointer shadow-xs"
                              title="Удалить скриншот"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-600 px-0.5">
                            <span className="truncate max-w-[110px]" title={img.name}>
                              {img.name}
                            </span>
                            <span className="text-slate-400 text-[10px] shrink-0">
                              {(img.size / 1024).toFixed(0)} КБ
                            </span>
                          </div>

                          {/* Quick copy & download buttons */}
                          <div className="mt-1.5 pt-1.5 border-t border-slate-100 grid grid-cols-2 gap-1 text-[10px]">
                            <button
                              type="button"
                              onClick={() => copyImageToClipboard(img)}
                              className="flex items-center justify-center gap-1 py-1 px-1.5 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 rounded-md font-medium transition-colors cursor-pointer"
                              title="Скопировать картинку в буфер обмена для вставки через Ctrl+V в Gmail или Telegram"
                            >
                              <Copy className="w-3 h-3" />
                              <span>В буфер</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => downloadImage(img)}
                              className="flex items-center justify-center gap-1 py-1 px-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-medium transition-colors cursor-pointer"
                              title="Скачать файл скриншота на диск"
                            >
                              <Download className="w-3 h-3" />
                              <span>Скачать</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Informative Guidance Banner */}
                    <div className="p-2.5 bg-amber-50/90 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="font-bold text-[11px] text-amber-950">
                          Как прикрепить скриншот в письмо или Telegram:
                        </p>
                        <p className="text-[11px] leading-relaxed text-amber-800">
                          Браузер по соображениям безопасности не может автоматически вложить локальный файл в сторонние приложения.
                          Нажмите кнопку <strong className="text-amber-950 font-bold">«В буфер»</strong> на скриншоте и вставьте его нажатием <kbd className="px-1.5 py-0.5 bg-white border border-amber-300 rounded text-[10px] font-mono shadow-2xs font-bold text-amber-950">Ctrl+V</kbd> в окне Gmail или чате Telegram, либо скачайте файл и перетащите его.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons: Telegram / Gmail / Mailto / Copy */}
              <div className="pt-2 border-t border-slate-200 space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={handleSendTelegram}
                    className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-sky-500 hover:bg-sky-400 active:bg-sky-600 text-white font-bold rounded-xl shadow-xs transition-colors cursor-pointer text-xs"
                    title="Открыть диалог с @madness_ua в Telegram"
                  >
                    <Send className="w-3.5 h-3.5 fill-current shrink-0" />
                    <span className="truncate">Telegram (@madness_ua)</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleOpenGmail}
                    className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white font-bold rounded-xl shadow-xs transition-colors cursor-pointer text-xs"
                    title="Открыть черновик письма в веб-версии Gmail"
                  >
                    <Mail className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">Веб-версия Gmail</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSendMailto}
                    className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-white font-bold rounded-xl shadow-xs transition-colors cursor-pointer text-xs"
                    title="Открыть в стандартной почтовой программе (Outlook, Mail и др.)"
                  >
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">Почтовое приложение</span>
                  </button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                  <button
                    type="button"
                    onClick={handleCopyReport}
                    className="flex items-center gap-1.5 text-blue-600 hover:text-blue-700 font-semibold cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5 shrink-0" />
                    <span>Скопировать готовый текст</span>
                  </button>

                  <div className="flex items-center gap-1.5 text-slate-600">
                    <span className="text-[11px] text-slate-400">Почта:</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(FEEDBACK_EMAIL, 'email', 'Email адрес')}
                      className="font-mono text-xs font-semibold text-slate-900 hover:text-blue-600 underline cursor-pointer"
                      title="Нажмите, чтобы скопировать адрес"
                    >
                      {FEEDBACK_EMAIL}
                    </button>
                  </div>
                </div>
              </div>

              {/* Teaser for Donation */}
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 text-amber-900">
                  <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Хотите поддержать развитие программы раскроя?</span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('donation')}
                  className="px-2.5 py-1 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold rounded-lg transition-colors shrink-0 cursor-pointer shadow-2xs"
                >
                  Перейти к донату →
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: CRYPTO DONATION */}
          {activeTab === 'donation' && (
            <div className="space-y-5">
              <div className="text-center max-w-md mx-auto">
                <h4 className="text-base font-extrabold text-slate-900">
                  Поддержка автора и развития сервиса
                </h4>
                <p className="text-xs text-slate-500 mt-1">
                  Если калькулятор помог вам сэкономить материал, время или деньги на производстве,
                  вы можете отблагодарить разработчика переводом любой суммы.
                </p>
              </div>

              {/* Crypto Network Toggle matching mobile screenshot */}
              <div className="flex justify-center">
                <div className="inline-flex p-1 bg-slate-900 rounded-xl text-xs font-bold shadow-xs">
                  <button
                    type="button"
                    onClick={() => setCryptoNetwork('TON')}
                    className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg transition-all cursor-pointer ${
                      cryptoNetwork === 'TON'
                        ? 'bg-blue-500 text-white shadow-xs'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <span>TON</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCryptoNetwork('TRC20')}
                    className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg transition-all cursor-pointer ${
                      cryptoNetwork === 'TRC20'
                        ? 'bg-blue-500 text-white shadow-xs'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <span>TRC20</span>
                  </button>
                </div>
              </div>

              {/* Network Instructions and Notice */}
              <div className="max-w-md mx-auto text-center space-y-1">
                <h5 className="text-sm font-bold text-slate-900">Ваш адрес для перевода</h5>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {cryptoNetwork === 'TON' ? (
                    <>
                      Отправляйте на этот адрес только <strong className="text-slate-800">Gram (GRAM)</strong> и{' '}
                      <strong className="text-slate-800">токены в сети TON</strong>, иначе вы можете потерять свои средства.
                    </>
                  ) : (
                    <>
                      Отправляйте только <strong className="text-slate-800">USDT TRC20</strong> на этот адрес, иначе вы можете потерять свои средства.
                    </>
                  )}
                </p>
              </div>

              {/* QR Code Presentation Box */}
              <div className="flex flex-col items-center justify-center">
                <div className="bg-white p-3 rounded-2xl border-2 border-slate-200 shadow-md flex items-center justify-center max-w-[280px]">
                  <img
                    src={
                      cryptoNetwork === 'TON'
                        ? '/assets/aistudio/qr_ton_card.png'
                        : '/assets/aistudio/qr_trc20_card.png'
                    }
                    alt={cryptoNetwork === 'TON' ? 'QR-код TON' : 'QR-код USDT TRC20'}
                    className="w-full h-auto rounded-xl object-contain shadow-2xs"
                  />
                </div>
              </div>

              {/* Address Container with Copy Button */}
              <div className="max-w-md mx-auto space-y-2">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-2 shadow-2xs">
                  <div className="font-mono text-xs text-slate-900 break-all select-all font-semibold leading-relaxed">
                    {cryptoNetwork === 'TON' ? TON_ADDRESS : TRC20_ADDRESS}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopy(
                        cryptoNetwork === 'TON' ? TON_ADDRESS : TRC20_ADDRESS,
                        cryptoNetwork,
                        `Адрес ${cryptoNetwork}`
                      )
                    }
                    className={`p-2 rounded-lg font-bold text-xs transition-all shrink-0 cursor-pointer ${
                      copiedField === cryptoNetwork
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-900 text-white hover:bg-slate-800'
                    }`}
                    title="Скопировать адрес"
                  >
                    {copiedField === cryptoNetwork ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    handleCopy(
                      cryptoNetwork === 'TON' ? TON_ADDRESS : TRC20_ADDRESS,
                      cryptoNetwork,
                      `Адрес ${cryptoNetwork}`
                    )
                  }
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-amber-400 hover:bg-amber-300 active:bg-amber-500 text-slate-950 font-bold rounded-xl shadow-xs transition-colors cursor-pointer text-xs"
                >
                  {copiedField === cryptoNetwork ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-800" />
                      <span>Адрес скопирован в буфер!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Скопировать адрес {cryptoNetwork}</span>
                    </>
                  )}
                </button>
              </div>

              {/* Thank you note */}
              <div className="text-center pt-2 text-xs text-slate-500">
                <p>Спасибо за вашу поддержку и вклад в развитие инструмента! 🤝</p>
              </div>
            </div>
          )}
        </div>

        {/* Global Toast Notification inside Modal */}
        {statusNotice && (
          <div className="bg-slate-900 text-white text-xs px-4 py-2 flex items-center justify-between gap-2 border-t border-slate-800">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>{statusNotice}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusNotice(null)}
              className="text-slate-400 hover:text-white"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
