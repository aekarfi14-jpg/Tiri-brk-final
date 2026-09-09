import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import {
  Users,
  Play,
  Copy,
  Check,
  Edit2,
  Trash2,
  Smartphone,
  Volume2,
  VolumeX,
  Radio,
  Wifi,
  HelpCircle,
  X,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { PlayerSlotData, TeamId, TEAMS, MAX_PLAYERS } from '../../types.ts';
import { sound } from '../../audio/soundEngine.ts';

interface TvLobbyProps {
  roomCode: string;
  host: string;
  port: number;
  players: PlayerSlotData[];
  onStartMatch: () => void;
  onUpdatePlayer: (slot: number, name: string, team: TeamId) => void;
  onKickPlayer: (slot: number) => void;
  onOpenPhoneSim: (slot: number) => void;
  onSwitchMode: () => void;
}

export const TvLobby: React.FC<TvLobbyProps> = ({
  roomCode,
  host,
  port,
  players,
  onStartMatch,
  onUpdatePlayer,
  onKickPlayer,
  onOpenPhoneSim,
  onSwitchMode,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [editingSlot, setEditingSlot] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editTeam, setEditTeam] = useState<TeamId>('RED');
  const [isMuted, setIsMuted] = useState(sound.getMuted());
  const [showHelpModal, setShowHelpModal] = useState(false);

  /*
   * IMPORTANT:
   * host + port come directly from App.tsx / NativeServer.
   * Do NOT fetch /api/host-info here.
   *
   * The Android Native WebSocket server may use 3000, 3001, ...
   * so the actual runtime port must always be used.
   */

  const isValidLanHost = (value: string): boolean => {
    if (!value) return false;

    const normalized = value.trim().toLowerCase();

    return (
      normalized !== 'localhost' &&
      normalized !== '127.0.0.1' &&
      normalized !== '0.0.0.0'
    );
  };

  const primaryLanIp = isValidLanHost(host)
    ? host
    : '127.0.0.1';

  const effectivePort = port > 0 ? port : 3000;

  /*
   * QR payload consumed by the in-app PhoneScanner.
   *
   * QR contains the exact LAN endpoint:
   *   mode=phone
   *   room=<roomCode>
   *   host=<TV LAN IP>
   *   port=<actual native WebSocket port>
   */
  const joinUrl =
    isValidLanHost(host) && roomCode
      ? `http://${primaryLanIp}:${effectivePort}/?mode=phone&room=${encodeURIComponent(
          roomCode
        )}&host=${encodeURIComponent(primaryLanIp)}&port=${effectivePort}`
      : '';

  useEffect(() => {
    if (!joinUrl) {
      setQrDataUrl('');
      return;
    }

    let cancelled = false;

    QRCode.toDataURL(joinUrl, {
      width: 340,
      margin: 1,
      color: {
        dark: '#090d16',
        light: '#ffffff',
      },
    })
      .then((url) => {
        if (!cancelled) {
          setQrDataUrl(url);
        }
      })
      .catch((err) => {
        console.error('QR generation error:', err);

        if (!cancelled) {
          setQrDataUrl('');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [joinUrl]);

  const copyCode = () => {
    sound.playClick();

    navigator.clipboard
      .writeText(roomCode)
      .catch(() => {
        // Clipboard may be unavailable in some WebView environments.
      });

    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const startEdit = (p: PlayerSlotData) => {
    sound.playClick();
    setEditingSlot(p.slot);
    setEditName(p.name);
    setEditTeam(p.team);
  };

  const saveEdit = (slot: number) => {
    sound.playClick();

    onUpdatePlayer(
      slot,
      editName.trim() || `Player ${slot}`,
      editTeam
    );

    setEditingSlot(null);
  };

  const toggleSound = () => {
    const muted = sound.toggleMute();
    setIsMuted(muted);
  };

  const activePlayers = players.filter((p) => p.connected);
  const allReady =
    activePlayers.length > 0 &&
    activePlayers.every((p) => p.ready);

  const canStart = activePlayers.length >= 1;

  return (
    <div
      id="tv-lobby-screen"
      className="fixed inset-0 bg-[#090d16] text-white flex flex-col p-6 md:p-8 select-none overflow-y-auto"
    >
      <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:28px_28px] pointer-events-none" />

      {/* Top Header Bar */}
      <div className="relative flex items-center justify-between border-b border-slate-800/80 pb-4 mb-6 z-10">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 shadow-[0_0_25px_rgba(56,189,248,0.2)]">
            <Radio className="w-6 h-6 animate-pulse text-cyan-400" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-widest text-cyan-400 font-bold">
                TIRI BRK • تيري برك
              </span>

              <span className="text-slate-600">•</span>

              <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 font-mono font-semibold border border-emerald-500/30">
                LAN HOST
              </span>
            </div>

            <h1 className="text-2xl md:text-3xl font-black font-['Chakra_Petch'] tracking-wide text-white">
              TIRI BRK
            </h1>
          </div>
        </div>

        {/* Top Right Controls */}
        <div className="flex items-center gap-3">
          <button
            id="btn-tv-help"
            onClick={() => setShowHelpModal(true)}
            className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-cyan-500 text-slate-300 hover:text-white transition-all cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
            title="LAN Network Info"
          >
            <HelpCircle className="w-4 h-4 text-cyan-400" />
            <span className="hidden sm:inline">
              معلومات الشبكة
            </span>
          </button>

          <button
            id="btn-tv-toggle-sound"
            onClick={toggleSound}
            className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-cyan-500 text-slate-300 hover:text-white transition-all cursor-pointer"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? (
              <VolumeX className="w-5 h-5 text-red-400" />
            ) : (
              <Volume2 className="w-5 h-5 text-cyan-400" />
            )}
          </button>

          <button
            id="btn-switch-to-phone"
            onClick={onSwitchMode}
            className="px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-emerald-500 text-xs text-slate-300 hover:text-white transition-all flex items-center gap-2 cursor-pointer"
          >
            <Smartphone className="w-4 h-4 text-emerald-400" />
            <span className="hidden sm:inline">
              Switch Role
            </span>
          </button>
        </div>
      </div>

      {/* Main Grid */}
      <div className="relative grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1 items-start z-10 max-w-7xl mx-auto w-full">

        {/* Left Column */}
        <div className="lg:col-span-5 flex flex-col items-center bg-slate-900/90 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl">

          {/* Room Title & Code */}
          <div className="text-center mb-5 w-full">
            <span className="text-xs uppercase tracking-widest text-slate-400 font-bold block mb-1">
              ROOM CODE • رمز الغرفة
            </span>

            <div className="flex items-center justify-center gap-3">
              <span className="text-4xl md:text-5xl font-black font-['Chakra_Petch'] tracking-widest text-cyan-400 drop-shadow-[0_0_15px_rgba(56,189,248,0.4)]">
                {roomCode || '----'}
              </span>

              <button
                id="btn-copy-code"
                onClick={copyCode}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
                title="Copy Room Code"
              >
                {copied ? (
                  <Check className="w-5 h-5 text-emerald-400" />
                ) : (
                  <Copy className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>

          {/* QR Code */}
          <div className="p-4 bg-white rounded-2xl shadow-[0_0_35px_rgba(56,189,248,0.25)] border-2 border-cyan-400 mb-5">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="Scan to join session"
                className="w-56 h-56 md:w-64 md:h-64 object-contain rounded-lg"
              />
            ) : (
              <div className="w-56 h-56 md:w-64 md:h-64 flex items-center justify-center text-slate-800 text-center px-4">
                {roomCode
                  ? 'جاري تجهيز رمز الاتصال...'
                  : 'في انتظار إنشاء الغرفة...'}
              </div>
            )}
          </div>

          {/* Instructions */}
          <div className="text-center space-y-1 w-full px-2">
            <p className="text-sm font-bold text-white">
              امسح الرمز من الهاتف أو أدخل الكود{' '}
              <span className="text-cyan-400 font-mono font-black">
                {roomCode}
              </span>
            </p>

            <p className="text-xs text-slate-400">
              Scan with smartphone camera to connect as controller
            </p>
          </div>

          {/* Connection Status */}
          <div className="mt-5 w-full pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400 font-medium">
            <span className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>مستضيف الشبكة المحلية جاهز</span>
            </span>

            <span className="text-emerald-400 font-bold font-mono">
              {activePlayers.length} / {MAX_PLAYERS} متصل
            </span>
          </div>
        </div>

        {/* Right Column */}
        <div className="lg:col-span-7 flex flex-col space-y-5">

          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2.5">
              <Users className="w-5 h-5 text-cyan-400" />

              <h2 className="text-xl md:text-2xl font-bold font-['Chakra_Petch'] text-white">
                قائمة اللاعبين المتصلين ({activePlayers.length} / {MAX_PLAYERS})
              </h2>
            </div>

            <span className="text-xs font-mono text-slate-400">
              LAN CONTROLLERS • الحد الأقصى {MAX_PLAYERS}
            </span>
          </div>

          {/* Player Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {players.length === 0 && (
              <div
                id="player-slot-empty-welcome"
                className="col-span-full p-8 rounded-3xl bg-slate-900/40 border-2 border-dashed border-slate-800 flex flex-col items-center justify-center text-center min-h-[180px] text-slate-500 space-y-3"
              >
                <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                  <Smartphone className="w-7 h-7 text-cyan-400 animate-pulse" />
                </div>

                <div>
                  <span className="text-base font-bold text-white block">
                    في انتظار انضمام اللاعبين بالهواتف...
                  </span>

                  <p className="text-xs text-slate-400 mt-1 max-w-sm">
                    امسح رمز الـ QR من كاميرا هاتفك، أو افتح المتصفح على أي هاتف متصل بنفس شبكة الـ Wi-Fi وأدخل الرمز:{' '}
                    <span className="text-cyan-400 font-mono font-bold mx-1 text-sm">
                      {roomCode}
                    </span>
                  </p>
                </div>
              </div>
            )}

            {players.map((player) => {
              const slotNum = player.slot;
              const isEditing = editingSlot === slotNum;
              const teamDef = TEAMS[player.team] || TEAMS.RED;

              if (!player.connected) {
                return (
                  <div
                    key={player.id || slotNum}
                    id={`player-slot-disconnected-${slotNum}`}
                    className="p-5 rounded-2xl bg-amber-950/20 border-2 border-dashed border-amber-500/50 transition-all flex flex-col justify-between min-h-[140px] animate-pulse"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                            P{slotNum}
                          </span>

                          <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            انقطع الاتصال
                          </span>
                        </div>

                        <h3 className="text-lg font-black font-['Chakra_Petch'] mt-1.5 tracking-wide text-slate-300">
                          {player.name}
                        </h3>
                      </div>

                      <button
                        type="button"
                        onClick={() => onKickPlayer(slotNum)}
                        className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-red-400 text-xs cursor-pointer"
                        title="حذف اللاعب"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="text-[11px] text-amber-400/90 font-medium">
                      في انتظار عودة الهاتف (مهلة 15 ثانية)...
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={player.id || slotNum}
                  id={`player-slot-${slotNum}`}
                  className="p-5 rounded-2xl bg-slate-900/90 border-2 transition-all shadow-lg flex flex-col justify-between min-h-[140px]"
                  style={{
                    borderColor: teamDef.color,
                    boxShadow: `0 0 20px ${teamDef.glowHex}`,
                  }}
                >
                  {isEditing ? (
                    <div className="space-y-3">
                      <div>
                        <label className="text-[10px] text-slate-400 uppercase font-bold">
                          اسم اللاعب
                        </label>

                        <input
                          type="text"
                          value={editName}
                          maxLength={16}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white text-sm font-semibold focus:outline-none focus:border-cyan-400"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-400 uppercase font-bold">
                          الفريق
                        </label>

                        <div className="flex gap-2 mt-1">
                          {(['RED', 'BLUE'] as TeamId[]).map((tId) => (
                            <button
                              key={tId}
                              type="button"
                              onClick={() => setEditTeam(tId)}
                              className={`flex-1 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                                editTeam === tId
                                  ? 'bg-white text-slate-950 shadow-md'
                                  : 'bg-slate-800 text-slate-400 hover:text-white'
                              }`}
                            >
                              {tId === 'RED'
                                ? 'أحمر (RED)'
                                : 'أزرق (BLUE)'}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="flex gap-2 justify-end pt-1">
                        <button
                          type="button"
                          onClick={() => setEditingSlot(null)}
                          className="px-2.5 py-1 rounded-md bg-slate-800 text-xs text-slate-300 hover:text-white cursor-pointer"
                        >
                          إلغاء
                        </button>

                        <button
                          type="button"
                          onClick={() => saveEdit(slotNum)}
                          className="px-3 py-1 rounded-md bg-cyan-600 text-xs font-bold text-white hover:bg-cyan-500 cursor-pointer"
                        >
                          حفظ
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                              P{slotNum}
                            </span>

                            <span
                              className="text-xs font-black px-2.5 py-0.5 rounded-full uppercase"
                              style={{
                                backgroundColor: `${teamDef.color}25`,
                                color: teamDef.lightColor,
                                border: `1px solid ${teamDef.color}60`,
                              }}
                            >
                              {teamDef.name}
                            </span>
                          </div>

                          <h3 className="text-xl font-black font-['Chakra_Petch'] mt-1.5 tracking-wide text-white">
                            {player.name}
                          </h3>
                        </div>

                        {/* Host Controls */}
                        <div className="flex items-center gap-1">
                          <button
                            id={`btn-edit-player-${slotNum}`}
                            onClick={() => startEdit(player)}
                            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-cyan-400 transition-colors cursor-pointer"
                            title="تعديل اللاعب"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>

                          <button
                            id={`btn-kick-player-${slotNum}`}
                            onClick={() => onKickPlayer(slotNum)}
                            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-red-400 transition-colors cursor-pointer"
                            title="فصل اللاعب"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Ready Status */}
                      <div className="flex items-center justify-between pt-3 border-t border-slate-800/80 mt-2">
                        <span className="text-xs text-slate-400 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-400" />
                          هاتف متصل
                        </span>

                        <span
                          className={`text-xs font-black px-2.5 py-1 rounded-full flex items-center gap-1 ${
                            player.ready
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          }`}
                        >
                          {player.ready ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                              <span>جاهز ✓</span>
                            </>
                          ) : (
                            <>
                              <Clock className="w-3.5 h-3.5 text-amber-400" />
                              <span>غير جاهز</span>
                            </>
                          )}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              );
            })}

            {/* Waiting Slot */}
            {players.length > 0 && players.length < MAX_PLAYERS && (
              <div
                id="player-slot-waiting-more"
                className="p-5 rounded-2xl bg-slate-900/30 border-2 border-dashed border-slate-800 flex flex-col items-center justify-center text-center min-h-[140px] text-slate-500 transition-all"
              >
                <Smartphone className="w-5 h-5 text-slate-600 mb-1.5" />

                <span className="text-xs font-bold uppercase tracking-wider block text-slate-400 font-mono">
                  + فتحة هاتف متوفرة ({players.length + 1})
                </span>

                <p className="text-[11px] text-slate-500 mt-1">
                  امسح رمز QR بالهاتف لإضافة لاعب جديد
                </p>
              </div>
            )}
          </div>

          {/* Start Match */}
          <div className="pt-4 flex flex-col gap-3">
            <button
              id="btn-tv-start-match"
              onClick={onStartMatch}
              disabled={!canStart}
              className={`w-full py-4 rounded-2xl font-black text-xl font-['Chakra_Petch'] tracking-widest transition-all cursor-pointer flex items-center justify-center gap-3 active:scale-[0.99] ${
                canStart
                  ? 'bg-gradient-to-r from-cyan-500 via-blue-600 to-cyan-500 hover:from-cyan-400 hover:via-blue-500 hover:to-cyan-400 text-white shadow-[0_0_35px_rgba(56,189,248,0.4)]'
                  : 'bg-slate-800 text-slate-500 border border-slate-700 opacity-60 cursor-not-allowed'
              }`}
            >
              <Play className="w-6 h-6 fill-current" />
              <span>ابدأ اللعبة • START GAME</span>
            </button>

            <p className="text-center text-xs text-slate-400">
              {activePlayers.length === 0
                ? 'امسح رمز QR بالهاتف للانضمام إلى اللعبة وبدء المواجهة.'
                : !allReady
                ? 'في انتظار تأكيد اللاعبين (جاهز) على هواتفهم، أو يمكنك البدء مباشرة!'
                : 'الجميع جاهز! اضغط على "ابدأ اللعبة" للانتقال التلقائي لأجهزة التحكم وبدء المعركة.'}
            </p>
          </div>
        </div>
      </div>

      {/* LAN Help Modal */}
      {showHelpModal && (
        <div
          id="lan-help-modal"
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-6 animate-in fade-in"
        >
          <div className="max-w-md w-full bg-slate-900 border-2 border-cyan-500/40 rounded-3xl p-6 shadow-2xl text-left space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Wifi className="w-5 h-5 text-cyan-400" />
                <h3 className="text-base font-bold text-white">
                  معلومات الشبكة المحلية (LAN)
                </h3>
              </div>

              <button
                type="button"
                onClick={() => setShowHelpModal(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <p>
                اللعبة تعمل بالكامل داخل الشبكة المحلية (LAN) بدون أي حاجة للإنترنت. تأكد من اتصال التلفاز والهواتف بنفس شبكة الـ Wi-Fi أو نقطة اتصال الهاتف (Hotspot).
              </p>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5 font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-400">
                    Host IP:
                  </span>

                  <span className="text-cyan-400 font-bold">
                    {primaryLanIp}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-slate-400">
                    Port:
                  </span>

                  <span className="text-white">
                    {effectivePort}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-slate-400">
                    Room Code:
                  </span>

                  <span className="text-cyan-300 font-bold">
                    {roomCode}
                  </span>
                </div>
              </div>

              {!isValidLanHost(host) && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300">
                  لم يتم الحصول على عنوان LAN صالح بعد. سيظهر QR تلقائياً عند توفر عنوان الشبكة.
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowHelpModal(false)}
              className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs cursor-pointer transition-all"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
