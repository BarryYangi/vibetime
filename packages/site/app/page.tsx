'use client'

import {
  IconActivityHeartbeat,
  IconCalendarStats,
  IconChartLine,
  IconChartPie,
  IconClockHour4,
  IconCloudOff,
  IconDeviceDesktop,
  IconFolderCode,
  IconPlugConnected,
  IconStar,
  IconTerminal2,
} from '@tabler/icons-react'
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import CloudShader from '@/components/CloudShader'
import { useTheme } from '@/contexts/ThemeContext'

const VERSION = '2026.5.18'
const REPO_URL = 'https://github.com/BarryYangi/vibetime'
const RELEASE_URL = `${REPO_URL}/releases/latest`

export default function HomePage() {
  const { getTextColorClass, shouldUseDarkText, getLinkColorClass } = useTheme()

  const [starCount, setStarCount] = useState<number | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.pause()
    const timer = setTimeout(() => {
      video.play().catch(() => {})
    }, 2000)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    fetch('https://api.github.com/repos/BarryYangi/vibetime', {
      headers: {
        Accept: 'application/vnd.github.v3+json',
      },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.stargazers_count != null) {
          setStarCount(data.stargazers_count)
        }
      })
      .catch(() => {})
  }, [])

  const formatStarCount = (count: number) => {
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}k`
    }
    return count.toString()
  }

  return (
    <main
      className={`min-h-screen overflow-x-hidden font-system-sans transition-colors duration-200 ${getTextColorClass()}`}
    >
      <div className="min-h-screen flex flex-col items-center justify-center pt-20 sm:pt-24 pb-9">
        <div className="max-w-3xl w-full flex flex-col items-center text-center px-8 animate-fadeInHome1 opacity-0">
          <Image
            src="/images/vibetime/icon.png"
            alt="VibeTime app icon"
            width={128}
            height={128}
            className="h-24 w-24 rounded-3xl border border-neutral-950/5 shadow-xl mb-2.5"
          />
          <div className="relative inline-flex flex-col items-center mb-8 animate-float">
            <div
              className={`w-3 h-3 rotate-45 rounded-[2px] -mb-[8px] z-10 ${
                shouldUseDarkText() ? 'bg-neutral-900' : 'bg-neutral-100'
              }`}
            />
            <div
              className={`px-4 py-1 rounded-full text-sm font-medium ${
                shouldUseDarkText()
                  ? 'bg-neutral-900 text-white'
                  : 'bg-neutral-100 text-neutral-950'
              }`}
            >
              VibeTime
            </div>
          </div>

          <h1 className="font-besley text-4xl xs:text-5xl md:text-6xl font-regular tracking-[-0.01em] mb-8">
            Track time across your AI coding agents
          </h1>
          <div className="flex flex-col sm:flex-row gap-2 items-center justify-center mb-3 w-full">
            <Link
              href={RELEASE_URL}
              className={`inline-flex w-full sm:w-auto justify-center items-center gap-2 px-5 h-12 rounded-xl text-base font-medium transition-opacity hover:opacity-70  ${
                shouldUseDarkText()
                  ? 'bg-neutral-950 text-white focus-visible:outline-none focus-visible:ring-neutral-950/20 focus-visible:ring-2 '
                  : 'bg-white text-neutral-950 focus-visible:outline-none focus-visible:ring-white/40 focus-visible:ring-2'
              }`}
            >
              Download latest
            </Link>
            <Link
              href={REPO_URL}
              target="_blank"
              className={`inline-flex w-full sm:w-auto justify-center items-center gap-1.5 pl-[18px] pr-3 h-12 rounded-xl text-base font-medium transition-opacity hover:opacity-70 ${
                shouldUseDarkText()
                  ? 'border border-neutral-950/10 focus-visible:outline-none focus-visible:ring-neutral-950/20 focus-visible:ring-2'
                  : 'border border-white/20 focus-visible:outline-none focus-visible:ring-white/40 focus-visible:ring-2'
              }`}
            >
              View on GitHub
              {starCount !== null && (
                <span
                  className={`flex items-center text-sm gap-0.5 h-5 pl-3 ml-2 sm:pl-2 sm:ml-1 border-l  border-dashed ${
                    shouldUseDarkText() ? 'border-neutral-950/10' : 'border-white/20'
                  }`}
                >
                  <IconStar size={12} fill="currentColor" stroke="none" />
                  {formatStarCount(starCount)}
                </span>
              )}
            </Link>
          </div>
          <div
            className={`text-sm mb-6 md:mb-1 ${
              shouldUseDarkText() ? 'text-neutral-950/40' : 'text-white/40'
            }`}
          >
            v{VERSION} ·{' '}
            <a
              href={RELEASE_URL}
              target="_blank"
              className={`hover:opacity-60 transition-opacity border-b border-dashed pb-0.5 ${getLinkColorClass()}`}
              rel="noopener"
            >
              macOS and Windows builds
            </a>
          </div>
        </div>

        <div className="w-full max-w-[1600px] mx-auto md:px-6 animate-fadeInHome2 opacity-0">
          <div className="relative overflow-hidden md:rounded-b-2xl">
            <Image
              src="/images/vibetime/vibetime-background.jpg"
              alt=""
              width={1920}
              height={1080}
              priority
              className={`absolute inset-0 w-full h-full object-cover -z-10 transition-opacity duration-500 ${
                shouldUseDarkText() ? 'opacity-100' : 'opacity-0'
              }`}
            />
            <Image
              src="/images/vibetime/vibetime-background-dark.jpg"
              alt=""
              width={1920}
              height={1080}
              priority
              className={`absolute inset-0 w-full h-full object-cover -z-10 transition-opacity duration-500 ${
                shouldUseDarkText() ? 'opacity-0' : 'opacity-100'
              }`}
            />
            <div className="absolute inset-0 w-full h-full -z-10 bg-[linear-gradient(to_bottom,var(--theme-background)_0%,transparent_60%)]" />
            <div className="w-full max-w-[960px] mx-auto px-6 py-6 md:py-24 animate-fadeInNav opacity-0">
              <video
                ref={videoRef}
                width={1620}
                height={1080}
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                poster="/images/vibetime/vibetime-demo-poster.png"
                className="aspect-[3/2] h-auto w-full max-w-full rounded-2xl border border-neutral-950/5 object-cover shadow-2xl"
              >
                <source src="/images/vibetime/vibetime-demo.mp4" type="video/mp4" />
              </video>
            </div>
          </div>
        </div>

        <div className="max-w-[840px] w-full flex flex-col px-8 pt-16 sm:pt-24 animate-fadeInHome2 opacity-0">
          <div className="flex flex-col gap-4 font-besley text-[32px] sm:text-[42px] !leading-tight tracking-[-0.008em] mb-10 sm:mb-20 text-left">
            <p>
              VibeTime tracks agent-assisted coding sessions locally, so you can see which agents
              worked on which projects, and for how long.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-8 text-left mb-12">
            {[
              {
                icon: IconClockHour4,
                title: 'Agent tracking',
                desc: 'Track Claude Code, Codex, Cursor, and Gemini CLI',
              },
              {
                icon: IconCalendarStats,
                title: 'Daily breakdown',
                desc: "See today's time by project and agent",
              },
              {
                icon: IconCloudOff,
                title: 'Private by default',
                desc: 'No account, cloud sync, or telemetry',
              },
              {
                icon: IconActivityHeartbeat,
                title: 'Live activity',
                desc: 'Watch active agent turns as they happen',
              },
              {
                icon: IconDeviceDesktop,
                title: 'Menu bar',
                desc: "Keep today's total visible while you code",
              },
              {
                icon: IconChartLine,
                title: 'History',
                desc: 'Review trends across 7, 30, 90, and 365 days',
              },
              {
                icon: IconPlugConnected,
                title: 'Hook installer',
                desc: 'Install and remove hooks without editing config files',
              },
              {
                icon: IconTerminal2,
                title: 'CLI',
                desc: 'Check status, history, and health from the terminal',
              },
              {
                icon: IconChartPie,
                title: 'Agent mix',
                desc: 'Compare time across agents',
              },
              {
                icon: IconFolderCode,
                title: 'Project detection',
                desc: 'Resolve projects from aliases, remotes, and folders',
              },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex flex-col items-start gap-3 py-1 max-w-72">
                <div
                  className={`flex items-center justify-center p-2 rounded-lg bg-neutral-950/5 ${
                    shouldUseDarkText() ? 'bg-neutral-950/5' : 'bg-white/5'
                  }`}
                >
                  <Icon
                    size={24}
                    stroke={1.2}
                    className={`mt-0.5 shrink-0 ${
                      shouldUseDarkText() ? 'text-neutral-950 opacity-40' : 'text-white opacity-40'
                    }`}
                  />
                </div>
                <div className="flex flex-col gap-0.5">
                  <div className="font-medium text-xl leading-snug">{title}</div>
                  <div
                    className={`text-lg leading-snug ${
                      shouldUseDarkText() ? 'text-neutral-950/50' : 'text-white/50'
                    }`}
                  >
                    {desc}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div
            className={`text-lg mb-16 sm:mb-24 text-left ${
              shouldUseDarkText() ? 'text-neutral-950/50' : 'text-white/50'
            }`}
          >
            Includes hook diagnostics, local exports, tray status, and{' '}
            <a
              href={RELEASE_URL}
              target="_blank"
              className={`hover:opacity-60 transition-opacity border-b border-dashed pb-0.5 ${getLinkColorClass()}`}
              rel="noopener"
            >
              release builds
            </a>
          </div>
        </div>

        <div className="w-full max-w-[1600px] mx-auto md:px-6 mb-8 sm:mb-20 animate-fadeInHome2 opacity-0">
          <div className="relative overflow-hidden md:rounded-t-2xl">
            <Image
              src="/images/vibetime/vibetime-background.jpg"
              alt=""
              width={1920}
              height={1080}
              className={`absolute inset-0 w-full h-full object-cover object-top -z-10 transition-opacity duration-500 ${
                shouldUseDarkText() ? 'opacity-70' : 'opacity-0'
              }`}
            />
            <Image
              src="/images/vibetime/vibetime-background-dark.jpg"
              alt=""
              width={1920}
              height={1080}
              className={`absolute inset-0 w-full h-full object-cover object-top -z-10 transition-opacity duration-500 ${
                shouldUseDarkText() ? 'opacity-0' : 'opacity-70'
              }`}
            />
            <div className="absolute inset-0 w-full h-full -z-10 bg-[linear-gradient(to_top,var(--theme-background)_0%,transparent_70%)]" />
            <div className="flex flex-col items-center gap-6 px-8 py-20 pt-28 sm:pt-32">
              <div
                className={`font-besley text-[32px] sm:text-[42px] !leading-[1.2] tracking-[-0.008em] text-center max-w-2xl ${
                  shouldUseDarkText() ? 'text-neutral-950' : 'text-white'
                }`}
              >
                Free, open source, and local-first.
              </div>
              <div className="flex flex-col sm:flex-row gap-2 items-center justify-center mb-3 w-full">
                <Link
                  href={RELEASE_URL}
                  className={`inline-flex w-full sm:w-auto justify-center items-center gap-2 px-5 h-12 rounded-xl text-base font-medium transition-opacity hover:opacity-70 ${
                    shouldUseDarkText()
                      ? 'bg-neutral-950 text-white focus-visible:outline-none focus-visible:ring-neutral-950/20 focus-visible:ring-2'
                      : 'bg-white text-neutral-950 focus-visible:outline-none focus-visible:ring-white/40 focus-visible:ring-2'
                  }`}
                >
                  Download latest
                </Link>
                <Link
                  href={REPO_URL}
                  target="_blank"
                  className={`inline-flex w-full sm:w-auto justify-center items-center gap-1.5 pl-[18px] pr-3 h-12 rounded-xl text-base font-medium transition-opacity hover:opacity-70 ${
                    shouldUseDarkText()
                      ? 'border border-neutral-950/10 focus-visible:outline-none focus-visible:ring-neutral-950/20 focus-visible:ring-2'
                      : 'border border-white/20 focus-visible:outline-none focus-visible:ring-white/40 focus-visible:ring-2'
                  }`}
                >
                  View on GitHub
                  {starCount !== null && (
                    <span
                      className={`flex items-center text-sm gap-0.5 h-5 pl-3 ml-2 sm:pl-2 sm:ml-1 border-l border-dashed ${
                        shouldUseDarkText() ? 'border-neutral-950/10' : 'border-white/20'
                      }`}
                    >
                      <IconStar size={12} fill="currentColor" stroke="none" />
                      {formatStarCount(starCount)}
                    </span>
                  )}
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div
          className={`w-full max-w-[1600px] px-8 md:px-12 text-sm ${
            shouldUseDarkText() ? 'text-neutral-950/50' : 'text-white/50'
          }`}
        >
          {/* Mobile: stacked centered */}
          <div className="flex flex-col items-center gap-4 sm:hidden">
            <div className="flex items-center gap-1.5">
              <span>Built with</span>
              <CloudShader size={20} pickerAlign="left" />
              <span>
                by{' '}
                <Link
                  href="https://barry.ee"
                  target="_blank"
                  className={`hover:opacity-60 transition-opacity font-medium border-b border-dotted pb-px ${getLinkColorClass()}`}
                >
                  Barry
                </Link>
              </span>
            </div>
          </div>
          {/* Desktop: 3-col grid */}
          <div className="hidden sm:grid grid-cols-3 items-end">
            <div className="flex items-center gap-1.5">
              <span>Built with</span>
              <CloudShader size={20} pickerAlign="left" />
              <span>
                by{' '}
                <Link
                  href="https://barry.ee"
                  target="_blank"
                  className={`hover:opacity-60 transition-opacity font-medium border-b border-dotted pb-px ${getLinkColorClass()}`}
                >
                  Barry
                </Link>
              </span>
            </div>
            <div />
            <div className="flex items-center justify-end gap-5">
              <a
                href={REPO_URL}
                target="_blank"
                className={`hover:opacity-60 transition-opacity font-medium border-b border-dotted pb-px ${getLinkColorClass()}`}
                rel="noopener"
              >
                GitHub
              </a>
              <a
                href={RELEASE_URL}
                target="_blank"
                className={`hover:opacity-60 transition-opacity font-medium border-b border-dotted pb-px ${getLinkColorClass()}`}
                rel="noopener"
              >
                Releases
              </a>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
