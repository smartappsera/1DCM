import React, { useState, useEffect } from 'react';
import {
  X,
  MessageSquare,
  Heart,
  Copy,
  Check,
  Mail,
  Send,
  ExternalLink,
  CheckCircle2,
} from 'lucide-react';

interface FeedbackDonationModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'feedback' | 'donation';
}

const TON_ADDRESS = 'UQBL6WfzOITTHkFjFkKaxJcEH191mKPomK6otxMoq4Za_w1Jo';
const TRC20_ADDRESS = 'TYeQrerTaXWfyn4rTbkSF7UhyQ75CrH1kc';

// Assembled dynamically to prevent automated plain-text harvesting / bots
const getEmailAddress = () => 'smartappsera' + '@' + 'gmail.com';
const getTelegramUrl = () => 'https://t.me/' + ['madness', 'ua'].join('_');

export const FeedbackDonationModal: React.FC<FeedbackDonationModalProps> = ({
  isOpen,
  onClose,
  defaultTab = 'feedback',
}) => {
  const [activeTab, setActiveTab] = useState<'feedback' | 'donation'>(defaultTab);
  const [cryptoNetwork, setCryptoNetwork] = useState<'TON' | 'TRC20'>('TON');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

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

  if (!isOpen) return null;

  const showToast = (text: string) => {
    setStatusNotice(text);
    setTimeout(() => setStatusNotice(null), 3000);
  };

  const handleCopy = (text: string, fieldId: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    showToast(`✓ ${label} скопирован в буфер обмена`);
    setTimeout(() => {
      setCopiedField((prev) => (prev === fieldId ? null : prev));
    }, 2500);
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
    openExternalLink(getTelegramUrl());
    showToast('Открываем чат в Telegram...');
  };

  const handleOpenGmail = () => {
    const email = getEmailAddress();
    const subject = encodeURIComponent('Линейный Раскрой — Обратная связь');
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${email}&su=${subject}`;
    openExternalLink(gmailUrl);
    showToast('Открываем черновик в веб-версии Gmail...');
  };

  const handleSendMailto = () => {
    const email = getEmailAddress();
    const subject = encodeURIComponent('Линейный Раскрой — Обратная связь');
    const mailtoUrl = `mailto:${email}?subject=${subject}`;
    openExternalLink(mailtoUrl);
    showToast('Открываем почтовое приложение...');
  };

  const handleCopyEmail = () => {
    handleCopy(getEmailAddress(), 'email', 'Email адрес');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
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
            <div className="space-y-4 py-1">
              <div className="text-center max-w-md mx-auto">
                <h4 className="text-base font-bold text-slate-900">
                  Связаться с разработчиком
                </h4>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  Если у вас есть идеи по улучшению сервиса, предложения по новому функционалу, вопросы по расчету или вы обнаружили ошибку — выберите удобный способ связи:
                </p>
              </div>

              {/* Action Channels Cards */}
              <div className="space-y-2.5 pt-2">
                {/* 1. Telegram */}
                <button
                  type="button"
                  onClick={handleSendTelegram}
                  className="w-full flex items-center justify-between p-3.5 bg-sky-500 hover:bg-sky-400 active:bg-sky-600 text-white rounded-xl shadow-xs transition-all cursor-pointer group text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                      <Send className="w-5 h-5 fill-current" />
                    </div>
                    <div>
                      <div className="font-bold text-sm leading-tight">Написать в Telegram</div>
                      <div className="text-xs text-sky-100 mt-0.5">
                        Открыть диалог в Telegram для быстрых ответов
                      </div>
                    </div>
                  </div>
                  <ExternalLink className="w-4 h-4 opacity-70 group-hover:opacity-100 transition-opacity shrink-0 ml-2" />
                </button>

                {/* 2. Gmail Web */}
                <button
                  type="button"
                  onClick={handleOpenGmail}
                  className="w-full flex items-center justify-between p-3.5 bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white rounded-xl shadow-xs transition-all cursor-pointer group text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                      <Mail className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold text-sm leading-tight">Написать через Gmail</div>
                      <div className="text-xs text-rose-100 mt-0.5">
                        Открыть черновик письма в веб-версии браузера
                      </div>
                    </div>
                  </div>
                  <ExternalLink className="w-4 h-4 opacity-70 group-hover:opacity-100 transition-opacity shrink-0 ml-2" />
                </button>

                {/* 3. Default Mail Client */}
                <button
                  type="button"
                  onClick={handleSendMailto}
                  className="w-full flex items-center justify-between p-3.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-white rounded-xl shadow-xs transition-all cursor-pointer group text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                      <ExternalLink className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold text-sm leading-tight">Почтовое приложение</div>
                      <div className="text-xs text-slate-300 mt-0.5">
                        Открыть в почтовой программе на устройстве (Outlook, Mail)
                      </div>
                    </div>
                  </div>
                  <ExternalLink className="w-4 h-4 opacity-70 group-hover:opacity-100 transition-opacity shrink-0 ml-2" />
                </button>
              </div>

              {/* Copy Email Helper (without plain-text display) */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleCopyEmail}
                  className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                    copiedField === 'email'
                      ? 'bg-emerald-50 border-emerald-400 text-emerald-800'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {copiedField === 'email' ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-600" />
                      <span>Email скопирован в буфер обмена!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-slate-500" />
                      <span>Скопировать адрес электронной почты</span>
                    </>
                  )}
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
                <div className="bg-white p-4 rounded-2xl border-2 border-slate-200 shadow-md flex items-center justify-center max-w-[260px] aspect-square">
                  <img
                    src={
                      cryptoNetwork === 'TON'
                        ? '/assets/qr_ton.svg'
                        : '/assets/qr_trc20.svg'
                    }
                    alt={cryptoNetwork === 'TON' ? 'QR-код TON' : 'QR-код USDT TRC20'}
                    className="w-full h-full object-contain"
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
