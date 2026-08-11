#!/usr/bin/env node
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs'

const user = process.env.GH_USER
const token = process.env.GH_TOKEN
const timeZone = process.env.STREAK_TZ || 'Europe/Istanbul'
const outDir = process.env.STREAK_OUT || 'assets'
const readmePath = process.env.STREAK_README || 'README.md'
const repo = process.env.GITHUB_REPOSITORY
const branch = process.env.GITHUB_REF_NAME || 'main'
const imgHeight = Number(process.env.STREAK_HEIGHT || 195)

if (!user || !token) {
  console.error('GH_USER and GH_TOKEN are required')
  process.exit(1)
}

const FONT = "'Segoe UI', Ubuntu, -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif"
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const FLAME = 'M12 1.5C12.6 5.2 15.2 6.6 16.4 9c.7 1.4 1 2.9.8 4.4C16.8 16.6 14.2 19 11.4 19 8.4 19 6 16.6 6 13.4c0-1.8.8-3.2 1.9-4.4.1 1.4.7 2.4 1.6 2.8.8.4 1.3-.2 1.3-1.2 0-2.2-.2-6.2 1.2-9.1Z'

const THEMES = {
  light: { bg: '#fffefe', border: '#e4e2e2', ring: '#fb8c00', text: '#151515', date: '#464646', divider: '#e4e2e2' },
  dark: { bg: '#0d1117', border: '#30363d', ring: '#fb8c00', text: '#c9d1d9', date: '#8b949e', divider: '#30363d' },
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

const graphql = async (query, variables, attempt = 1) => {
  try {
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        authorization: `bearer ${token}`,
        'content-type': 'application/json',
        'user-agent': 'streak-card',
      },
      body: JSON.stringify({ query, variables }),
    })
    if (!res.ok) throw new Error(`GitHub API ${res.status}: ${(await res.text()).slice(0, 300)}`)
    const body = await res.json()
    if (body.errors) throw new Error(JSON.stringify(body.errors))
    return body.data
  } catch (error) {
    if (attempt >= 5) throw error
    console.warn(`attempt ${attempt} failed: ${error.message}`)
    await sleep(attempt * 3000)
    return graphql(query, variables, attempt + 1)
  }
}

const todayInZone = () => new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date())

const fetchCalendar = async (from, to) => {
  const data = await graphql(
    `query($login:String!,$from:DateTime!,$to:DateTime!){
      user(login:$login){
        contributionsCollection(from:$from,to:$to){
          contributionCalendar{ weeks{ contributionDays{ date contributionCount } } }
        }
      }
    }`,
    { login: user, from, to },
  )
  return data.user.contributionsCollection.contributionCalendar.weeks.flatMap(w => w.contributionDays)
}

const collectDays = async () => {
  const { user: profile } = await graphql(`query($login:String!){ user(login:$login){ createdAt } }`, { login: user })
  const createdAt = profile.createdAt.slice(0, 10)
  const today = todayInZone()
  const days = new Map()

  for (let year = Number(createdAt.slice(0, 4)); year <= Number(today.slice(0, 4)); year++) {
    const from = year === Number(createdAt.slice(0, 4)) ? `${createdAt}T00:00:00Z` : `${year}-01-01T00:00:00Z`
    const to = `${year}-12-31T23:59:59Z`
    for (const day of await fetchCalendar(from, to)) {
      if (day.date >= createdAt && day.date <= today) days.set(day.date, day.contributionCount)
    }
  }

  return { days: [...days.entries()].sort(([a], [b]) => (a < b ? -1 : 1)), today }
}

const computeStats = ({ days, today }) => {
  const total = days.reduce((sum, [, count]) => sum + count, 0)

  let longest = 0
  let longestFrom = null
  let longestTo = null
  let runFrom = null
  let run = 0
  for (const [date, count] of days) {
    if (count > 0) {
      if (run === 0) runFrom = date
      run++
      if (run > longest) {
        longest = run
        longestFrom = runFrom
        longestTo = date
      }
    } else {
      run = 0
    }
  }

  let index = days.length - 1
  if (index >= 0 && days[index][1] === 0) index--
  let current = 0
  let currentTo = index >= 0 ? days[index][0] : today
  let currentFrom = currentTo
  while (index >= 0 && days[index][1] > 0) {
    current++
    currentFrom = days[index][0]
    index--
  }

  return {
    total,
    totalFrom: days.length ? days[0][0] : today,
    current,
    currentFrom: current ? currentFrom : today,
    currentTo: current ? currentTo : today,
    currentIsLive: current > 0 && currentTo === today,
    longest,
    longestFrom: longest ? longestFrom : today,
    longestTo: longest ? longestTo : today,
    today,
  }
}

const day = (iso, currentYear) => {
  const [y, m, d] = iso.split('-').map(Number)
  return `${MONTHS[m - 1]} ${d}${String(y) === currentYear ? '' : `, ${y}`}`
}

const buildCard = (stats, theme) => {
  const t = THEMES[theme]
  const year = stats.today.slice(0, 4)
  const totalRange = `${day(stats.totalFrom, year)} - Present`
  const currentRange = stats.current
    ? `${day(stats.currentFrom, year)} - ${stats.currentIsLive ? 'Present' : day(stats.currentTo, year)}`
    : day(stats.today, year)
  const longestRange = stats.longest ? `${day(stats.longestFrom, year)} - ${day(stats.longestTo, year)}` : '-'
  const label = `${user} on GitHub: ${stats.current} day current streak, ${stats.longest} day longest streak, ${stats.total} total contributions`

  return `<svg width="495" height="195" viewBox="0 0 495 195" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="streakTitle">
<title id="streakTitle">${label}</title>
<style>
.num{font:700 28px ${FONT};fill:${t.text}}
.cap{font:700 14px ${FONT};fill:${t.text}}
.hot{font:700 14px ${FONT};fill:${t.ring}}
.sub{font:400 12px ${FONT};fill:${t.date}}
.in{opacity:0;animation:in .5s ease-out forwards}
.d2{animation-delay:.12s}
.d3{animation-delay:.24s}
@keyframes in{to{opacity:1}}
@media(prefers-reduced-motion:reduce){.in{animation:none;opacity:1}}
</style>
<rect x=".5" y=".5" width="494" height="194" rx="6" fill="${t.bg}" stroke="${t.border}"/>
<line x1="165" y1="38" x2="165" y2="157" stroke="${t.divider}"/>
<line x1="330" y1="38" x2="330" y2="157" stroke="${t.divider}"/>
<g class="in">
<text class="num" x="82.5" y="78" text-anchor="middle" dominant-baseline="central">${stats.total}</text>
<text class="cap" x="82.5" y="112" text-anchor="middle">Total Contributions</text>
<text class="sub" x="82.5" y="133" text-anchor="middle">${totalRange}</text>
</g>
<g class="in d2">
<circle cx="247.5" cy="78" r="40" fill="none" stroke="${t.ring}" stroke-width="5" stroke-dasharray="220 32" transform="rotate(-67.6 247.5 78)"/>
<g transform="translate(232.3 23.7) scale(1.3)"><path fill="${t.ring}" d="${FLAME}"/></g>
<text class="num" x="247.5" y="79" text-anchor="middle" dominant-baseline="central">${stats.current}</text>
<text class="hot" x="247.5" y="143" text-anchor="middle">Current Streak</text>
<text class="sub" x="247.5" y="163" text-anchor="middle">${currentRange}</text>
</g>
<g class="in d3">
<text class="num" x="412.5" y="78" text-anchor="middle" dominant-baseline="central">${stats.longest}</text>
<text class="cap" x="412.5" y="112" text-anchor="middle">Longest Streak</text>
<text class="sub" x="412.5" y="133" text-anchor="middle">${longestRange}</text>
</g>
</svg>
`
}

const updateReadme = stats => {
  if (!repo || !existsSync(readmePath)) return
  const version = `${stats.total}-${stats.current}-${stats.longest}`
  const url = theme => `https://raw.githubusercontent.com/${repo}/${branch}/${outDir}/streak-${theme}.svg?v=${version}`
  const imgWidth = Math.round((495 * imgHeight) / 195)
  const block = `<!-- streak:start -->
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="${url('dark')}">
  <source media="(prefers-color-scheme: light)" srcset="${url('light')}">
  <img alt="GitHub streak" src="${url('light')}" width="${imgWidth}" height="${imgHeight}">
</picture>
<!-- streak:end -->`
  const readme = readFileSync(readmePath, 'utf8')
  const markers = /<!-- streak:start -->[\s\S]*?<!-- streak:end -->/
  if (!markers.test(readme)) {
    console.log('README has no streak markers, skipping README update')
    return
  }
  writeFileSync(readmePath, readme.replace(markers, block))
}

const stats = computeStats(await collectDays())
mkdirSync(outDir, { recursive: true })
for (const theme of Object.keys(THEMES)) {
  writeFileSync(`${outDir}/streak-${theme}.svg`, buildCard(stats, theme))
}
updateReadme(stats)
console.log(`total=${stats.total} current=${stats.current} longest=${stats.longest}`)
