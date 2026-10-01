import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Expand, Hand, Info, Minimize, MoveUpRight, Pause, Play, RotateCcw, X } from 'lucide-react';
import { Experience, type SceneState } from './scene/Experience';
import type { Phrase } from './scene/avatar';

type Locale = 'en' | 'ar';
const text = {
  en: {
    demo: 'An interactive experience', place: 'HOSPITAL RECEPTION', title: 'Start with a hello.',
    instruction: 'Choose a phrase. Watch it in sign.', hello: 'Hello', morning: 'Good morning', thanks: 'Thank you',
    ready: 'Ready to connect', entering: 'Arriving at reception', loading: 'Preparing your experience', playing: 'A conversation in motion',
    replay: 'Replay entrance', preview: 'ASL · Motion preview', approved: 'Reviewed sign clip', selected: 'Selected phrase',
    story: 'A conversation starts here.', scene: 'Hospital reception', help: 'About this experience',
    modalTitle: 'One phrase. A connection.', modalSubtitle: 'A small glimpse of communication through sign.',
    steps: ['Arrive at the reception.', 'Choose something to say.', 'Watch the avatar bring it to life.'],
    note: 'The included motions are illustrative ASL previews and have not been validated by a Deaf signer.',
    gotIt: 'Let’s try it', pause: 'Pause animation', resume: 'Resume animation', reduce: 'Reduce ambient motion',
    restore: 'Enable ambient motion', fullscreen: 'Enter full screen', exit: 'Exit full screen',
    retry: 'Reload experience', error: 'The 3D experience couldn’t load.', speed: 'Playback speed', replayPhrase: 'Replay phrase',
    reduceLabel: 'Still view', motionLabel: 'Gentle motion',
  },
  ar: {
    demo: 'تجربة تفاعلية', place: 'استقبال المستشفى', title: 'تبدأ بمرحباً.',
    instruction: 'اختر عبارة. شاهدها بلغة الإشارة.', hello: 'مرحباً', morning: 'صباح الخير', thanks: 'شكراً',
    ready: 'جاهزون للتواصل', entering: 'الوصول إلى الاستقبال', loading: 'نجهّز تجربتك', playing: 'حوار بلغة الإشارة',
    replay: 'أعد الدخول', preview: 'إشارات ASL · معاينة حركية', approved: 'مقطع إشارة معتمد', selected: 'العبارة المختارة',
    story: 'هنا يبدأ الحوار.', scene: 'استقبال المستشفى', help: 'عن هذه التجربة',
    modalTitle: 'عبارة واحدة. تواصل.', modalSubtitle: 'لمحة صغيرة عن التواصل بلغة الإشارة.',
    steps: ['الوصول إلى الاستقبال.', 'اختر ما تريد قوله.', 'شاهد الشخصية تعبّر عنه.'],
    note: 'الحركات المضمّنة هي معاينات توضيحية لإشارات ASL ولم يعتمدها شخص أصم متخصّص.',
    gotIt: 'لنجرّب', pause: 'إيقاف الحركة مؤقتاً', resume: 'استئناف الحركة', reduce: 'تقليل حركة المشهد',
    restore: 'تفعيل حركة المشهد', fullscreen: 'ملء الشاشة', exit: 'الخروج من ملء الشاشة',
    retry: 'إعادة تحميل التجربة', error: 'تعذّر تحميل المشهد ثلاثي الأبعاد.', speed: 'سرعة الحركة', replayPhrase: 'إعادة العبارة',
    reduceLabel: 'مشهد ثابت', motionLabel: 'حركة هادئة',
  },
};

const phraseIds: Phrase[] = ['hello', 'good-morning', 'thank-you'];

export default function App() {
  const [locale, setLocale] = useState<Locale>('en');
  const [state, setState] = useState<SceneState>({ phase: 'loading', progress: 0, phrase: null, validated: false });
  const [selected, setSelected] = useState<Phrase | null>(null);
  const [paused, setPaused] = useState(false);
  const [slow, setSlow] = useState(false);
  const [full, setFull] = useState(false);
  const [reduced, setReduced] = useState(() => {
    const saved = localStorage.getItem('signscape-reduced-motion');
    return saved === null ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : saved === 'true';
  });
  const host = useRef<HTMLDivElement>(null);
  const experience = useRef<Experience | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const t = text[locale];
  const phrases = [t.hello, t.morning, t.thanks];
  const ready = state.phase === 'ready' || state.phase === 'playing';
  const busy = state.phase === 'entering' || state.phase === 'playing';

  useEffect(() => {
    if (!host.current) return;
    try { experience.current = new Experience(host.current, setState, reduced); }
    catch { setState({ phase: 'error', phrase: null, progress: 0, validated: false, error: 'This browser could not create a WebGL 3D view.' }); }
    return () => { experience.current?.dispose(); experience.current = null; };
    // Scene lifetime is independent from language and playback settings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    const fullscreenChanged = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', fullscreenChanged);
    const listener = (event: KeyboardEvent) => {
      if (dialog.current?.open || !ready || event.repeat) return;
      if (event.key === '1' || event.key === '2' || event.key === '3') select(phraseIds[Number(event.key) - 1]);
      if (event.key.toLowerCase() === 'r') replay();
    };
    window.addEventListener('keydown', listener);
    return () => { document.removeEventListener('fullscreenchange', fullscreenChanged); window.removeEventListener('keydown', listener); };
  });

  const select = (phrase: Phrase) => { if (!ready) return; setSelected(phrase); setPaused(false); experience.current?.play(phrase); };
  const replay = () => { setSelected(null); setPaused(false); experience.current?.replayEntrance(); };
  const togglePause = () => { if (!experience.current) return; experience.current.paused = !paused; setPaused(!paused); };
  const toggleReduced = () => {
    const next = !reduced; setReduced(next); localStorage.setItem('signscape-reduced-motion', String(next)); experience.current?.setReducedMotion(next);
  };
  const toggleSlow = () => { setSlow(!slow); if (experience.current) experience.current.speed = !slow ? .6 : 1; };
  const fullscreen = async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
    catch { /* Fullscreen is optional in embedded browsers. */ }
  };
  const phaseLabel = state.phase === 'loading' ? t.loading : state.phase === 'entering' ? t.entering : state.phase === 'playing' ? t.playing : t.ready;

  return (
    <div className="app-shell" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <header className="site-header">
        <a className="brand" href="./" aria-label="Deafference — Signscape">
          <img src="/brand/deafference.jpeg" alt="Deafference" />
          <span className="brand-rule" />
          <span className="brand-experience">signscape<span className="brand-dot" /></span>
        </a>
        <div className="header-meta"><span className="tiny-dot" />{t.demo}</div>
        <nav className="header-actions" aria-label="Experience controls">
          <div className="language-control" aria-label="Language">
            <button aria-label="English" aria-pressed={locale === 'en'} className={locale === 'en' ? 'active' : ''} onClick={() => setLocale('en')}>EN</button>
            <span>/</span>
            <button aria-label="العربية" aria-pressed={locale === 'ar'} className={locale === 'ar' ? 'active' : ''} onClick={() => setLocale('ar')}>AR</button>
          </div>
          <button className="icon-button info-control" aria-label={t.help} onClick={() => dialog.current?.showModal()} title={t.help}><Info size={18} strokeWidth={1.65} /></button>
          <button className="icon-button full-control" aria-label={full ? t.exit : t.fullscreen} onClick={fullscreen} title={full ? t.exit : t.fullscreen}>{full ? <Minimize size={19} /> : <Expand size={19} />}</button>
        </nav>
      </header>

      <main className="experience" data-phase={state.phase}>
        <div className="scene-stage">
          <div className="canvas-host" ref={host} />
          <div className="scene-vignette" />
          <div className="scene-heading" aria-hidden="true"><span className="scene-number">01</span><div className="scene-heading-rule" /><span>{t.place}</span></div>
          {state.phase === 'playing' && selected && (
            <div className="phrase-caption" key={selected}>
              <span>{t.selected}</span><strong>{phrases[phraseIds.indexOf(selected)]}</strong>
            </div>
          )}
          <div className="scene-footer">
            <div className="scene-location"><span className="location-line" /><span>01 <span className="muted-slash">/</span> {t.scene}</span></div>
            <div className="scene-motion"><button onClick={toggleReduced} className={reduced ? 'reduced' : ''} aria-label={reduced ? t.restore : t.reduce} aria-pressed={reduced} title={reduced ? t.restore : t.reduce}><span className="motion-indicator"><i /><i /><i /></span>{reduced ? t.reduceLabel : t.motionLabel}</button></div>
          </div>
          {state.phase === 'error' && <div className="error-card" role="alert"><Hand size={30} strokeWidth={1.3} /><h2>{t.error}</h2><p>{state.error}</p><button onClick={() => window.location.reload()}>{t.retry}<RotateCcw size={16} /></button></div>}
        </div>

        <aside className={`interaction-panel ${ready ? 'is-ready' : ''}`} aria-label={t.instruction}>
          <div className="panel-eyebrow"><span className="panel-number">01</span><span>{t.place}</span><MoveUpRight size={15} strokeWidth={1.5} /></div>
          <h1>{t.title}</h1>
          <p className="panel-instruction">{t.instruction}</p>
          <div className="phrase-buttons">
            {phraseIds.map((phrase, i) => (
              <button key={phrase} className={`phrase-button ${selected === phrase ? 'selected' : ''} ${!selected && i === 0 ? 'suggested' : ''}`} disabled={!ready} onClick={() => select(phrase)} aria-label={phrases[i]} aria-pressed={selected === phrase}>
                <span className="button-index">0{i + 1}</span><span className="button-label">{phrases[i]}</span>
                {selected === phrase && state.phase === 'playing' ? <span className={`playing-bars ${paused ? 'paused' : ''}`}><i /><i /><i /></span> : <ArrowRight className="phrase-arrow" size={19} strokeWidth={1.65} />}
              </button>
            ))}
          </div>

          <div className="playback-status" role="status" aria-live="polite"><span className={`status-dot ${busy ? 'busy' : ''}`} /><span>{phaseLabel}</span>
            <button className={`speed-control ${slow ? 'slow' : ''}`} onClick={toggleSlow} title={t.speed} aria-label={`${t.speed}: ${slow ? '.6' : '1'}×`}>{slow ? '0.6×' : '1×'}</button>
          </div>
          <div className="progress-track" role="progressbar" aria-label={phaseLabel} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(state.progress * 100)}><span style={{ transform: `scaleX(${busy ? state.progress : 0})` }} /></div>
          <div className="panel-bottom-actions">
            <button className="entrance-replay" onClick={replay} disabled={state.phase === 'loading' || state.phase === 'error'}><RotateCcw size={16} strokeWidth={1.65} />{t.replay}</button>
            {busy ? <button className="icon-button pause-button" aria-label={paused ? t.resume : t.pause} onClick={togglePause}>{paused ? <Play size={15} /> : <Pause size={15} />}</button> : selected ? <button className="icon-button pause-button" aria-label={t.replayPhrase} onClick={() => select(selected)}><Play size={15} /></button> : <Hand size={19} strokeWidth={1.3} className="idle-hand" />}
          </div>
          <div className={`preview-note ${state.validated ? 'approved' : ''}`}>{state.validated ? <Check size={11} /> : <span className="preview-dot" />}{state.validated ? t.approved : t.preview}</div>
        </aside>
        <div className="connection-tagline">{t.story}<span className="tagline-plus">+</span></div>
      </main>

      <dialog className="about-dialog" ref={dialog}>
        <button className="dialog-close icon-button" aria-label={locale === 'en' ? 'Close' : 'إغلاق'} onClick={() => dialog.current?.close()}><X size={20} /></button>
        <span className="modal-kicker">DEAFFERENCE / SIGNSCAPE</span>
        <h2>{t.modalTitle}</h2><p className="modal-subtitle">{t.modalSubtitle}</p>
        <ol>{t.steps.map((step, i) => <li key={i}><span>0{i + 1}</span>{step}</li>)}</ol>
        <p className="validation-note">{t.note}</p>
        <button className="modal-try" onClick={() => dialog.current?.close()}>{t.gotIt}<ArrowRight size={18} /></button>
        <div className="modal-shortcuts">{locale === 'en' ? 'Keyboard: 1 · 2 · 3 to choose. R to replay.' : 'لوحة المفاتيح: 1 · 2 · 3 للاختيار. R لإعادة الدخول.'}</div>
      </dialog>
    </div>
  );
}
