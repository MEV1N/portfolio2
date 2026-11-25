'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Send, CheckCircle2 } from 'lucide-react';

export default function PortfolioPage() {
  const [cursorLabel, setCursorLabel] = useState('+');
  const [activeModalSrc, setActiveModalSrc] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', contact: '', message: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const cursorRef = useRef<HTMLDivElement>(null);
  const popupVideoRef = useRef<HTMLVideoElement>(null);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.contact || !formData.message) return;
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          contact: formData.contact,
          message: formData.message,
          service: 'General Inquiry',
          budget: 'Flexible',
        }),
      });
      if (res.ok) {
        setSubmitSuccess(true);
        setFormData({ name: '', contact: '', message: '' });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openVideo = (src: string) => {
    setActiveModalSrc(src);
    if (popupVideoRef.current) {
      popupVideoRef.current.load();
      popupVideoRef.current.play().catch(() => {});
    }
  };

  const closeVideo = () => {
    if (popupVideoRef.current) {
      popupVideoRef.current.pause();
    }
    setActiveModalSrc(null);
  };

  useEffect(() => {
    // 1. Mouse movement tracking
    const handleMouseMove = (e: MouseEvent) => {
      if (cursorRef.current) {
        cursorRef.current.style.left = `${e.clientX}px`;
        cursorRef.current.style.top = `${e.clientY}px`;
      }
    };
    window.addEventListener('mousemove', handleMouseMove);

    // 2. Cursor labels on hover
    const setLabel = (text: string) => () => setCursorLabel(text);
    const resetLabel = () => setCursorLabel('+');

    const closeBtn = document.getElementById('close-video');
    if (closeBtn) {
      closeBtn.addEventListener('mouseenter', setLabel('CLOSE'));
      closeBtn.addEventListener('mouseleave', resetLabel);
    }

    const navLinks = document.querySelectorAll('#navbar a');
    navLinks.forEach((link) => {
      link.addEventListener('mouseenter', setLabel('GO TO'));
      link.addEventListener('mouseleave', resetLabel);
    });

    const workCards = document.querySelectorAll('.work-card');
    workCards.forEach((card) => {
      card.addEventListener('mouseenter', setLabel('VIEW'));
      card.addEventListener('mouseleave', resetLabel);
    });

    const editSmalls = document.querySelectorAll('.edit-small');
    editSmalls.forEach((card) => {
      card.addEventListener('mouseenter', setLabel('PLAY'));
      card.addEventListener('mouseleave', resetLabel);
    });

    const contactLinks = document.querySelectorAll('.contact-link');
    contactLinks.forEach((link) => {
      link.addEventListener('mouseenter', setLabel('OPEN'));
      link.addEventListener('mouseleave', resetLabel);
    });

    // 3. Scroll reveal with IntersectionObserver
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
          }
        });
      },
      { threshold: 0.12 }
    );
    document.querySelectorAll('.fade-up').forEach((el) => observer.observe(el));

    // 4. Navbar shrink and hero parallax on scroll
    const handleScroll = () => {
      const nav = document.getElementById('navbar');
      if (nav) {
        nav.style.padding = window.scrollY > 80 ? '8px 14px' : '10px 16px';
      }

      const bgText = document.querySelector('.hero-bg-text') as HTMLElement | null;
      if (bgText) {
        bgText.style.transform = `translate(-50%, calc(-48% + ${window.scrollY * 0.25}px))`;
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });

    // 5. Escape key to close modals
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeVideo();
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('scroll', handleScroll);
      document.removeEventListener('keydown', handleKeyDown);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="portfolio-page">
      {/* ── Video Modal ── */}
      <div
        id="video-modal"
        className={activeModalSrc ? 'active' : ''}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            closeVideo();
          }
        }}
      >
        <div className="video-modal-content">
          <button id="close-video" onClick={closeVideo}>
            ✕
          </button>
          <video
            ref={popupVideoRef}
            id="popup-video"
            controls
            playsInline
            src={activeModalSrc || ''}
          />
        </div>
      </div>

      {/* ── Custom Cursor Label ── */}
      <div ref={cursorRef} id="cursor-label">
        {cursorLabel}
      </div>

      {/* ── NAV ── */}
      <nav id="navbar">
        <div className="logo">MEVIN</div>
        <a href="#about">About</a>
        <a href="#posters">Posters</a>
        <a href="#edits">Edits</a>
        <a href="#websites">Websites</a>
        <a href="#tools">Tools</a>
        <a href="#contact" className="cta">
          Let's Talk →
        </a>
      </nav>

      {/* ════════════════════════════
         HERO
      ════════════════════════════ */}
      <section id="hero">
        {/* Watermark behind */}
        <div className="hero-bg-text">PORTFOLIO</div>

        {/* Photo pill */}
        <div className="hero-photo">
          <img src="/mevin_portrait.png" alt="Mevin" />
        </div>

        {/* Hero text, bottom-left */}
        <div className="hero-my">My</div>
      </section>

      {/* ════════════════════════════
         MARQUEE
      ════════════════════════════ */}
      <div className="marquee-wrap">
        <div className="marquee-inner">
          <div className="marquee-item"><span className="marquee-dot"></span>DESIGN</div>
          <div className="marquee-item"><span className="marquee-dot"></span>EDIT</div>
          <div className="marquee-item"><span className="marquee-dot"></span>DEVELOP</div>
          <div className="marquee-item"><span className="marquee-dot"></span>DESIGN</div>
          <div className="marquee-item"><span className="marquee-dot"></span>EDIT</div>
          <div className="marquee-item"><span className="marquee-dot"></span>DEVELOP</div>
          <div className="marquee-item"><span className="marquee-dot"></span>DESIGN</div>
          <div className="marquee-item"><span className="marquee-dot"></span>EDIT</div>
          <div className="marquee-item"><span className="marquee-dot"></span>DEVELOP</div>
          <div className="marquee-item"><span className="marquee-dot"></span>DESIGN</div>
          <div className="marquee-item"><span className="marquee-dot"></span>EDIT</div>
          <div className="marquee-item"><span className="marquee-dot"></span>DEVELOP</div>
          <div className="marquee-item"><span className="marquee-dot"></span>DESIGN</div>
          <div className="marquee-item"><span className="marquee-dot"></span>EDIT</div>
          <div className="marquee-item"><span className="marquee-dot"></span>DEVELOP</div>
          <div className="marquee-item"><span className="marquee-dot"></span>DESIGN</div>
          <div className="marquee-item"><span className="marquee-dot"></span>EDIT</div>
          <div className="marquee-item"><span className="marquee-dot"></span>DEVELOP</div>
          <div className="marquee-item"><span className="marquee-dot"></span>DESIGN</div>
          <div className="marquee-item"><span className="marquee-dot"></span>EDIT</div>
          <div className="marquee-item"><span className="marquee-dot"></span>DEVELOP</div>
        </div>
      </div>

      {/* ════════════════════════════
         ABOUT
      ════════════════════════════ */}
      <section id="about">
        {/* LEFT: intro + verbs */}
        <div className="about-left fade-up">
          <p className="intro">
            I am <strong>Mevin</strong> and I
          </p>
          <div className="about-verbs">
            DESIGN.<br />
            EDIT.<br />
            DEVELOP.
          </div>
        </div>

        {/* RIGHT: bio + experience + skills */}
        <div className="about-right fade-up">
          <h2>About Mevin</h2>
          <p>
            I am a <strong>designer, video editor,</strong> and{' '}
            <strong>web developer</strong> who enjoys creating clean and engaging
            digital work. I work well under deadlines and focus on delivering quality
            results.
          </p>
          <p>
            I'm passionate about bringing ideas to life through visuals, motion, and
            websites, while constantly improving my skills.
          </p>

          {/* Work Experience */}
          <div className="exp-section">
            <div className="exp-label">Work Experience</div>

            <div className="exp-item">
              <div className="exp-dot"></div>
              <div>
                <div className="exp-role">Video Editor</div>
                <div className="exp-company">Tinkerhub</div>
                <div className="exp-desc">
                  Volunteered as a video editor editing timelines and improving
                  visual storytelling across events and campaigns.
                </div>
              </div>
            </div>

            <div className="exp-item">
              <div className="exp-dot"></div>
              <div>
                <div className="exp-role">Freelance Editor + Web Dev</div>
                <div className="exp-company">Independent Projects</div>
                <div className="exp-desc">
                  Freelance video editor and web developer — creating content and
                  building websites for different projects and communities.
                </div>
              </div>
            </div>

            <div className="exp-item">
              <div className="exp-dot"></div>
              <div>
                <div className="exp-role">Event Design &amp; Visual Content</div>
                <div className="exp-company">Multiple Clients</div>
                <div className="exp-desc">
                  Designed posters for college tech fests and hackathons, focusing
                  on engaging and impactful visuals.
                </div>
              </div>
            </div>

            <div className="exp-item">
              <div className="exp-dot"></div>
              <div>
                <div className="exp-role">Website &amp; Platform Dev</div>
                <div className="exp-company">Devsnest · Tailwine</div>
                <div className="exp-desc">
                  Developed fully functional websites — responsive and
                  user-friendly experiences for communities and platforms.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════
         POSTERS
      ════════════════════════════ */}
      <section id="posters">
        <div className="section-watermark">POSTERS</div>
        <div className="section-solid-title">POSTERS.</div>

        <div className="works-grid">
          <div
            className="work-card fade-up"
            onMouseEnter={() => setCursorLabel('VIEW')}
            onMouseLeave={() => setCursorLabel('+')}
          >
            <img src="/post/oasis poster.png" alt="Oasis Festival Poster" loading="lazy" />
            <div className="work-number">01</div>
            <div className="work-card-label">
              <h4>Oasis Festival</h4>
              <p>Event Poster</p>
            </div>
          </div>
          <div
            className="work-card fade-up"
            onMouseEnter={() => setCursorLabel('VIEW')}
            onMouseLeave={() => setCursorLabel('+')}
          >
            <img src="/post/bootup.png" alt="Bootup Tech Fest" loading="lazy" />
            <div className="work-number">02</div>
            <div className="work-card-label">
              <h4>Bootup Tech Fest</h4>
              <p>Tinkerhub MEC</p>
            </div>
          </div>
          <div
            className="work-card fade-up"
            onMouseEnter={() => setCursorLabel('VIEW')}
            onMouseLeave={() => setCursorLabel('+')}
          >
            <img src="/post/salt.png" alt="Salt Campaign Visual" loading="lazy" />
            <div className="work-number">03</div>
            <div className="work-card-label">
              <h4>Salt Campaign</h4>
              <p>Brand &amp; Identity</p>
            </div>
          </div>
          <div
            className="work-card fade-up"
            onMouseEnter={() => setCursorLabel('VIEW')}
            onMouseLeave={() => setCursorLabel('+')}
          >
            <img src="/post/Zero to maker.png" alt="Zero to Maker Hackathon" loading="lazy" />
            <div className="work-number">04</div>
            <div className="work-card-label">
              <h4>Zero to Maker</h4>
              <p>Hackathon Visual</p>
            </div>
          </div>
          <div
            className="work-card fade-up"
            onMouseEnter={() => setCursorLabel('VIEW')}
            onMouseLeave={() => setCursorLabel('+')}
          >
            <img src="/post/Ux.png" alt="UX Design System" loading="lazy" />
            <div className="work-number">05</div>
            <div className="work-card-label">
              <h4>UX Design System</h4>
              <p>Product Experience</p>
            </div>
          </div>
        </div>

        <div className="works-caption">
          <span>Featured Posters</span> — Tap to explore designs
        </div>
      </section>

      {/* ════════════════════════════
         EDITS
      ════════════════════════════ */}
      <section id="edits">
        <div className="section-watermark italic">Edits</div>
        <div className="section-solid-title">EDITS</div>

        <div className="edit-showcase">
          {/* Main Reel */}
          <div className="edit-main fade-up">
            <video
              className="main-video"
              autoPlay
              loop
              muted
              controls
              playsInline
            >
              <source src="/vid/vid 3.mp4" type="video/mp4" />
            </video>

            <div className="video-overlay">
              <span id="video-category">Featured Reel</span>
              <h3 id="video-title">Decenda Promo</h3>
            </div>
          </div>

          {/* Smaller Videos */}
          <div className="edit-gallery">
            <div
              className="edit-small fade-up"
              data-title="Motion Graphics"
              data-desc="Animated visual design project"
              onClick={() => openVideo('/vid/vid 1.mp4')}
            >
              <video muted playsInline preload="metadata">
                <source src="/vid/vid 1.mp4" type="video/mp4" />
              </video>
              <p>Project Review</p>
            </div>

            <div
              className="edit-small fade-up"
              data-title="Event Recap"
              data-desc="Highlights from the recent event"
              onClick={() => openVideo('/vid/vid 2.mp4')}
            >
              <video muted playsInline preload="metadata">
                <source src="/vid/vid 2.mp4" type="video/mp4" />
              </video>
              <p>AMV Edit</p>
            </div>

            <div
              className="edit-small fade-up"
              data-title="Commercial Edit"
              data-desc="Product showcase video"
              onClick={() => openVideo('/vid/vid 4.mp4')}
            >
              <video muted playsInline preload="metadata">
                <source src="/vid/vid 4.mp4" type="video/mp4" />
              </video>
              <p>AMV Edit</p>
            </div>

            <div
              className="edit-small fade-up"
              data-title="Event Highlight"
              data-desc="Key moments from the event"
              onClick={() => openVideo('/vid/vid 5.mp4')}
            >
              <video muted playsInline preload="metadata">
                <source src="/vid/vid 5.mp4" type="video/mp4" />
              </video>
              <p>Promo Video</p>
            </div>

            <div
              className="edit-small fade-up"
              data-title="Motion Graphics"
              data-desc="Animated visual design project"
              onClick={() => openVideo('/vid/vid 6.mp4')}
            >
              <video muted playsInline preload="metadata">
                <source src="/vid/vid 6.mp4" type="video/mp4" />
              </video>
              <p>Stop Motion</p>
            </div>

            <div
              className="edit-small fade-up"
              data-title="Event Recap"
              data-desc="Highlights from the recent event"
              onClick={() => openVideo('/vid/vid 7.mp4')}
            >
              <video muted playsInline preload="metadata">
                <source src="/vid/vid 7.mp4" type="video/mp4" />
              </video>
              <p>Event Promo</p>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════
         WEBSITES
      ════════════════════════════ */}
      <section id="websites">
        <div className="section-watermark">WEBSITES</div>
        <div className="section-solid-title">WEBSITES.</div>

        <div className="works-grid">
          <Link
            href="/work/web"
            style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
          >
            <div className="work-card fade-up">
              <div className="work-number">01</div>
              <div className="work-card-label">
                <h4>Platform Redesign</h4>
                <p>Community App</p>
              </div>
            </div>
          </Link>

          <Link
            href="/work/video"
            style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
          >
            <div className="work-card fade-up">
              <div className="work-number">02</div>
              <div className="work-card-label">
                <h4>E-Commerce Storefront</h4>
                <p>Web Platform</p>
              </div>
            </div>
          </Link>

          <Link
            href="/work/design"
            style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
          >
            <div className="work-card fade-up">
              <div className="work-number">03</div>
              <div className="work-card-label">
                <h4>Event Hub</h4>
                <p>Landing Site</p>
              </div>
            </div>
          </Link>
        </div>

        <div className="works-caption">
          <span>Featured Work</span> — Tap to visit websites
        </div>
      </section>

      {/* ════════════════════════════
         TOOLS
      ════════════════════════════ */}
      <section id="tools">
        <div className="tools-header">
          <h2 className="tools-title">TOOLS I USE</h2>
          <p
            style={{
              color: 'rgba(255,255,255,0.4)',
              fontSize: '14px',
              maxWidth: '260px',
              fontWeight: 300,
              lineHeight: 1.6,
            }}
          >
            My creative stack — the tools that bring every project to life.
          </p>
        </div>
        <div className="tools-grid">
          <div className="tool-item fade-up">
            <div className="tool-icon">
              <img src="/logo/Adobe-Premier-Pro.jpg" alt="Premiere Pro" />
            </div>
            <div className="tool-name">Premiere Pro</div>
            <div className="tool-desc">
              Professional video editing — timelines, color grading, and
              full-length productions.
            </div>
          </div>
          <div className="tool-item fade-up">
            <div className="tool-icon">
              <img src="/logo/ae.webp" alt="After Effects" />
            </div>
            <div className="tool-name">After Effects</div>
            <div className="tool-desc">
              Motion graphics, visual effects, and animated sequences for
              engaging content.
            </div>
          </div>
          <div className="tool-item fade-up">
            <div className="tool-icon">
              <img src="/logo/figma.png" alt="Figma" />
            </div>
            <div className="tool-name">Figma</div>
            <div className="tool-desc">
              UI design, prototyping, and wireframing — from concept to
              pixel-perfect delivery.
            </div>
          </div>
          <div className="tool-item fade-up">
            <div className="tool-icon">
              <img src="/logo/vs.png" alt="VS Code" />
            </div>
            <div className="tool-name">VS Code</div>
            <div className="tool-desc">
              Primary development environment for web projects, extensions, and
              coding workflows.
            </div>
          </div>
          <div className="tool-item fade-up">
            <div className="tool-icon">
              <img src="/logo/github.png" alt="GitHub" />
            </div>
            <div className="tool-name">GitHub</div>
            <div className="tool-desc">
              Version control, collaboration, and project hosting for all
              development work.
            </div>
          </div>
          <div className="tool-item fade-up">
            <div className="tool-icon">
              <img src="/logo/canva.jpg" alt="Canva" />
            </div>
            <div className="tool-name">Canva</div>
            <div className="tool-desc">
              Quick social media visuals, presentations, and brand content with
              speed.
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════
         SPRINT PRICING
      ════════════════════════════ */}
      <section id="pricing" style={{ padding: '60px 48px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div className="tools-header" style={{ marginBottom: '32px' }}>
            <h2 className="tools-title" style={{ fontSize: 'clamp(28px, 4vw, 44px)' }}>
              SPRINT PACKAGES
            </h2>
            <p
              style={{
                color: 'rgba(255,255,255,0.5)',
                fontSize: '15px',
                maxWidth: '480px',
                fontWeight: 300,
                lineHeight: 1.6,
              }}
            >
              Rapid, high-impact milestone sprints for Indian and global founders, tailored to your exact project scope and roadmap.
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '24px',
            }}
          >
            {/* Package 1: Web Sprint */}
            <div
              className="fade-up"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                borderRadius: '16px',
                padding: '28px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ color: '#60a5fa', fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Web Architecture &amp; Performance
                </div>
                <h3 style={{ fontSize: '22px', fontWeight: 800, color: '#fff', marginBottom: '12px' }}>
                  Next.js 15 Speed Sprint
                </h3>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '16px' }}>
                  <span style={{ fontSize: '20px', fontWeight: 700, color: '#fff' }}>Custom Scope</span>
                  <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px' }}>Tailored Deliverables</span>
                </div>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', lineHeight: 1.6, marginBottom: '20px' }}>
                  Sub-200ms TTFB optimization, Google PageSpeed score elevation (90+ mobile), image optimization, and responsive Tailwind UI fixes.
                </p>
              </div>
              <Link
                href="/work/web"
                style={{
                  color: '#60a5fa',
                  fontSize: '13px',
                  fontWeight: 600,
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                View Web Case Study →
              </Link>
            </div>

            {/* Package 2: Video Sprint */}
            <div
              className="fade-up"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(168, 85, 247, 0.3)',
                borderRadius: '16px',
                padding: '28px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ color: '#c084fc', fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '8px' }}>
                  High-Retention Video
                </div>
                <h3 style={{ fontSize: '22px', fontWeight: 800, color: '#fff', marginBottom: '12px' }}>
                  Hook &amp; Pacing Sprint
                </h3>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '16px' }}>
                  <span style={{ fontSize: '20px', fontWeight: 700, color: '#fff' }}>Custom Scope</span>
                  <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px' }}>Tailored Deliverables</span>
                </div>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', lineHeight: 1.6, marginBottom: '20px' }}>
                  First 0:30 hook redesign, kinetic captions, dynamic B-roll rhythm, and 3-track sound design for YouTube essays &amp; viral short-form reels.
                </p>
              </div>
              <Link
                href="/work/video"
                style={{
                  color: '#c084fc',
                  fontSize: '13px',
                  fontWeight: 600,
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                View Video Case Study →
              </Link>
            </div>

            {/* Package 3: Design Sprint */}
            <div
              className="fade-up"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '16px',
                padding: '28px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ color: '#34d399', fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '8px' }}>
                  UI/UX &amp; Design Systems
                </div>
                <h3 style={{ fontSize: '22px', fontWeight: 800, color: '#fff', marginBottom: '12px' }}>
                  Figma Conversion Audit
                </h3>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '16px' }}>
                  <span style={{ fontSize: '20px', fontWeight: 700, color: '#fff' }}>Custom Scope</span>
                  <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px' }}>Tailored Deliverables</span>
                </div>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', lineHeight: 1.6, marginBottom: '20px' }}>
                  WCAG AAA contrast audit, cognitive load reduction, checkout flow simplification, and reusable Figma tokens for web and mobile apps.
                </p>
              </div>
              <Link
                href="/work/design"
                style={{
                  color: '#34d399',
                  fontSize: '13px',
                  fontWeight: 600,
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                View Design Case Study →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════
         CONTACT
      ════════════════════════════ */}
      <section id="contact">
        <div className="contact-left fade-up">
          <h2>
            LET'S<br />WORK<br /><span>TOGETHER.</span>
          </h2>
          <p>
            Have a project in mind? Let's discuss your timeline, scope, and goals to create something memorable.
          </p>

          <div className="contact-links-list">
            <a href="mailto:mevinmanu04@gmail.com" className="contact-link">
              <div>
                <div className="cl-label">Email</div>
                <div className="cl-value">mevinmanu04@gmail.com</div>
              </div>
              <div className="cl-arrow">→</div>
            </a>
            <a
              href="https://github.com/mev1n"
              target="_blank"
              rel="noopener noreferrer"
              className="contact-link"
            >
              <div>
                <div className="cl-label">GitHub</div>
                <div className="cl-value">github.com/mev1n</div>
              </div>
              <div className="cl-arrow">→</div>
            </a>
            <a
              href="https://www.linkedin.com/in/mevin-aby-manu-979a0632b/"
              target="_blank"
              rel="noopener noreferrer"
              className="contact-link"
            >
              <div>
                <div className="cl-label">LinkedIn</div>
                <div className="cl-value">linkedin.com/in/mevin</div>
              </div>
              <div className="cl-arrow">→</div>
            </a>
          </div>
        </div>

        <div className="contact-right fade-up">
          <div className="contact-form-card">
            {submitSuccess ? (
              <div className="contact-success-state">
                <CheckCircle2
                  style={{
                    width: '48px',
                    height: '48px',
                    color: '#43a86a',
                    margin: '0 auto 16px',
                  }}
                />
                <h3>MESSAGE SENT</h3>
                <p>
                  Thank you for reaching out! Mevin has received your inquiry and will get back to you shortly.
                </p>
                <button
                  type="button"
                  className="contact-reset-btn"
                  onClick={() => setSubmitSuccess(false)}
                >
                  Send Another Message
                </button>
              </div>
            ) : (
              <>
                <div className="contact-form-header">
                  <h3>SEND A MESSAGE</h3>
                  <p>Have an idea, project, or question? Send a note directly to Mevin.</p>
                </div>

                <form onSubmit={handleSendMessage} className="contact-form">
                  <div className="contact-field-group">
                    <label htmlFor="contact-name" className="contact-field-label">
                      Name / Studio
                    </label>
                    <input
                      id="contact-name"
                      type="text"
                      placeholder="e.g. Alex Rivera or Apex Media"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>

                  <div className="contact-field-group">
                    <label htmlFor="contact-contact" className="contact-field-label">
                      Email or Telegram
                    </label>
                    <input
                      id="contact-contact"
                      type="text"
                      placeholder="e.g. alex@example.com or @alexrivera"
                      required
                      value={formData.contact}
                      onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                    />
                  </div>

                  <div className="contact-field-group">
                    <label htmlFor="contact-message" className="contact-field-label">
                      Your Message
                    </label>
                    <textarea
                      id="contact-message"
                      placeholder="Tell Mevin about your project, timeline, and goals..."
                      rows={4}
                      required
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    />
                  </div>

                  <button
                    type="submit"
                    className="contact-submit-btn"
                    disabled={isSubmitting}
                    onMouseEnter={() => setCursorLabel('SEND')}
                    onMouseLeave={() => setCursorLabel('+')}
                  >
                    <Send style={{ width: '16px', height: '16px' }} />
                    {isSubmitting ? 'Sending...' : 'Send Message'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ════════════════════════════
         FOOTER
      ════════════════════════════ */}
      <footer>
        <span>© 2025 Mevin Aby Manu</span>
        <span>Designed &amp; Developed by Mevin</span>
      </footer>
    </div>
  );
}
