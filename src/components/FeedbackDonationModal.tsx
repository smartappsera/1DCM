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
      contact ? `Контакт автора: ${contact}` : null,
      `Дата: ${new Date().toLocaleString('ru-RU')}`,
      `---------------------------------------`,
      `Текст сообщения:`,
      message.trim() || '(текст не указан)',
      `---------------------------------------`,
      screenshots.length > 0 ? `Прикреплено скриншотов: ${screenshots.length} шт.` : null,
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
    if (!message.trim()) {
      showToast('Пожалуйста, напишите сообщение перед отправкой');
      return;
    }

    const fullText = buildFeedbackText();
    // Copy to clipboard so user can simply paste into chat along with any screenshots
    navigator.clipboard.writeText(fullText);

    const tgUrl = `https://t.me/${TELEGRAM_USERNAME}`;
    openExternalLink(tgUrl);
    showToast('Текст скопирован! Открываем чат с @madness_ua в Telegram...');
  };

  const handleOpenGmail = () => {
    if (!message.trim()) {
      showToast('Пожалуйста, напишите сообщение перед отправкой');
      return;
    }

    const fullText = buildFeedbackText();
    navigator.clipboard.writeText(fullText);

    const subject = encodeURIComponent(`[Линейный Раскрой] ${getCategoryTitle()}`);
    const body = encodeURIComponent(
      fullText +
        (screenshots.length > 0
          ? '\n\n(При необходимости прикрепите файлы скриншотов к письму)'
          : '')
    );

    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${FEEDBACK_EMAIL}&su=${subject}&body=${body}`;
    openExternalLink(gmailUrl);
    showToast('Текст скопирован! Открываем черновик в Gmail...');
  };

  const handleSendMailto = () => {
    if (!message.trim()) {
      showToast('Пожалуйста, напишите сообщение перед отправкой');
      return;
    }

    const fullText = buildFeedbackText();
    navigator.clipboard.writeText(fullText);

    const subject = encodeURIComponent(`[Линейный Раскрой] ${getCategoryTitle()}`);
    const body = encodeURIComponent(
      fullText +
        (screenshots.length > 0
          ? '\n\n(При необходимости прикрепите файлы скриншотов к письму)'
          : '')
    );

    const mailtoUrl = `mailto:${FEEDBACK_EMAIL}?subject=${subject}&body=${body}`;
    openExternalLink(mailtoUrl);
    showToast('Текст скопирован! Открываем почтовую программу...');
  };

  const handleCopyReport = () => {
    if (!message.trim()) {
      showToast('Пожалуйста, напишите текст сообщения');
      return;
    }
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

              {/* Contact info input */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Ваш контакт для ответа <span className="font-normal text-slate-400">(по желанию)</span>
                </label>
                <input
                  type="text"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="@username в Telegram или адрес электронной почты"
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-900 transition-all placeholder:text-slate-400"
                />
              </div>

              {/* Message text area */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Текст сообщения <span className="text-rose-500">*</span>
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
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5 text-slate-400" />
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
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mt-3">
                    {screenshots.map((img) => (
                      <div
                        key={img.id}
                        className="group relative rounded-lg border border-slate-200 bg-white overflow-hidden p-1 shadow-2xs"
                      >
                        <div className="h-24 w-full bg-slate-100 rounded-md overflow-hidden flex items-center justify-center">
                          <img
                            src={img.dataUrl}
                            alt={img.name}
                            className="max-h-full max-w-full object-contain"
                          />
                        </div>
                        <div className="mt-1 flex items-center justify-between px-1 text-[11px] text-slate-600">
                          <span className="truncate max-w-[120px]" title={img.name}>
                            {img.name}
                          </span>
                          <span className="text-slate-400 shrink-0">
                            {(img.size / 1024).toFixed(0)} КБ
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeScreenshot(img.id);
                          }}
                          className="absolute top-2 right-2 p-1 bg-slate-900/80 hover:bg-rose-600 text-white rounded-md opacity-80 group-hover:opacity-100 transition-all cursor-pointer shadow-xs"
                          title="Удалить скриншот"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
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
