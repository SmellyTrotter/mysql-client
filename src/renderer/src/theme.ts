import { theme as antdTheme } from 'antd'
import type { ThemeConfig } from 'antd'

export type Appearance = 'light' | 'dark' | 'system'
export type AccentStrength = 'soft' | 'normal' | 'vivid'

export interface ThemePreset {
  name: string
  color: string
}

export interface ThemeGroup {
  label: string
  presets: ThemePreset[]
}

export const THEME_GROUPS: ThemeGroup[] = [
  {
    label: '经典',
    presets: [
      { name: '极光蓝', color: '#1677ff' },
      { name: '葡萄紫', color: '#722ed1' },
      { name: '翡翠绿', color: '#52a132' },
      { name: '活力橙', color: '#fa8c16' },
      { name: '胭脂红', color: '#e5484d' },
      { name: '青碧', color: '#0d9aa8' }
    ]
  },
  {
    label: '浓郁',
    presets: [
      { name: '靛青', color: '#3b5bdb' },
      { name: '松石绿', color: '#0ca678' },
      { name: '琥珀金', color: '#e8a317' },
      { name: '莓果', color: '#d6336c' },
      { name: '深青', color: '#0b7285' },
      { name: '熔岩', color: '#e8590c' }
    ]
  },
  {
    label: '莫兰迪',
    presets: [
      { name: '雾霾蓝', color: '#6c8ebf' },
      { name: '鼠尾草', color: '#82a882' },
      { name: '陶土棕', color: '#b9806a' },
      { name: '藕荷', color: '#a68bb5' },
      { name: '暖灰', color: '#8c8378' },
      { name: '灰绿', color: '#7d9b8f' }
    ]
  }
]

export const ALL_THEME_COLORS = THEME_GROUPS.flatMap((g) => g.presets.map((p) => p.color))

export function normalizeHex(input: string): string {
  let s = input.trim().toLowerCase()
  if (!s.startsWith('#')) s = `#${s}`
  if (/^#[0-9a-f]{3}$/.test(s)) s = `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`
  return /^#[0-9a-f]{6}$/.test(s) ? s : '#1677ff'
}

function hexToRgb(hex: string): [number, number, number] {
  const s = normalizeHex(hex)
  return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)]
}

/** weight 为 colorA 在结果中的占比 */
export function mix(colorA: string, colorB: string, weight: number): string {
  const a = hexToRgb(colorA)
  const b = hexToRgb(colorB)
  const w = Math.min(1, Math.max(0, weight))
  const c = (i: number) => Math.round(a[i] * w + b[i] * (1 - w)).toString(16).padStart(2, '0')
  return `#${c(0)}${c(1)}${c(2)}`
}

export function withAlpha(color: string, alpha: number): string {
  const [r, g, b] = hexToRgb(color)
  return `rgba(${r}, ${g}, ${b}, ${Math.min(1, Math.max(0, alpha)).toFixed(3)})`
}

const STRENGTH = {
  soft: { tint: 0.045, subtle: 0.022, border: 0.28, soft: 0.08 },
  normal: { tint: 0.1, subtle: 0.05, border: 0.45, soft: 0.14 },
  vivid: { tint: 0.2, subtle: 0.11, border: 0.68, soft: 0.24 }
}

/**
 * 由主题色 + 深浅模式 + 强度派生出全套 CSS 变量。
 * 自定义 CSS 与 antd 组件 token 共用同一套值，保证界面各处着色一致。
 */
export function buildThemeVars(
  primaryInput: string,
  dark: boolean,
  strength: AccentStrength
): Record<string, string> {
  const p = normalizeHex(primaryInput)
  const s = STRENGTH[strength] ?? STRENGTH.normal
  const surface = dark ? '#1f1f1f' : '#ffffff'
  const surfaceAlt = dark ? '#191919' : '#fafafa'
  const surfaceRaised = dark ? '#262626' : '#ffffff'
  const border = dark ? '#353535' : '#e9e9e9'

  const cellBases = dark
    ? { num: '#8ab4ff', dt: '#c9a7ff', json: '#ff9ac6', bool: '#ff9b7a', enum: '#8fd67a' }
    : { num: '#0958d9', dt: '#531dab', json: '#c41d7f', bool: '#d4380d', enum: '#237804' }

  return {
    '--app-primary': p,
    '--app-primary-hover': mix(p, '#ffffff', dark ? 0.76 : 0.6),
    '--app-primary-active': mix(p, '#000000', dark ? 0.66 : 0.82),
    '--app-primary-text': dark ? mix(p, '#ffffff', 0.55) : mix(p, '#000000', 0.76),
    '--app-primary-bg': mix(p, surface, s.tint),
    '--app-primary-bg-subtle': mix(p, surfaceAlt, s.subtle),
    '--app-primary-border': mix(p, border, s.border),
    '--app-primary-soft': withAlpha(p, s.soft),
    '--app-primary-shadow': withAlpha(p, 0.22),

    '--app-surface': surface,
    '--app-surface-alt': surfaceAlt,
    '--app-surface-raised': surfaceRaised,
    '--app-text': dark ? '#e6e6e6' : '#1f1f1f',
    '--app-text-muted': dark ? '#9b9b9b' : '#8c8c8c',
    '--app-text-subtle': dark ? '#707070' : '#bfbfbf',
    '--app-border': border,
    '--app-border-strong': dark ? '#4a4a4a' : '#d9d9d9',
    '--app-hover-bg': mix(p, dark ? '#242424' : '#f5f5f5', s.subtle),
    '--app-selected-bg': mix(p, surface, s.tint),
    '--app-scrollbar-thumb': mix(p, dark ? '#4a4a4a' : '#d9d9d9', 0.35),
    '--app-scrollbar-track': dark ? '#1a1a1a' : '#f6f6f6',
    '--app-shadow': dark ? '0 8px 24px rgba(0,0,0,.5)' : '0 6px 16px rgba(0,0,0,.12)',
    '--app-shadow-border': dark ? '0 0 1px rgba(255,255,255,.14)' : '0 0 1px rgba(0,0,0,.15)',

    '--app-cell-num': mix(p, cellBases.num, dark ? 0.26 : 0.36),
    '--app-cell-dt': mix(p, cellBases.dt, dark ? 0.26 : 0.36),
    '--app-cell-json': mix(p, cellBases.json, dark ? 0.26 : 0.36),
    '--app-cell-bool': mix(p, cellBases.bool, dark ? 0.26 : 0.36),
    '--app-cell-enum': mix(p, cellBases.enum, dark ? 0.26 : 0.36)
  }
}

/** antd 组件级 token：把主题色铺到按钮、表格、树、菜单、分页、输入等控件 */
export function buildAntdTheme(
  primaryInput: string,
  dark: boolean,
  v: Record<string, string>
): ThemeConfig {
  const p = normalizeHex(primaryInput)
  return {
    algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      colorPrimary: p,
      colorInfo: p,
      colorLink: v['--app-primary-text'],
      colorLinkHover: v['--app-primary-hover'],
      colorLinkActive: v['--app-primary-active'],
      colorPrimaryBg: v['--app-primary-bg'],
      colorPrimaryBorder: v['--app-primary-border'],
      colorPrimaryHover: v['--app-primary-hover'],
      colorPrimaryActive: v['--app-primary-active'],
      colorPrimaryText: v['--app-primary-text'],
      colorBgLayout: v['--app-surface-alt'],
      colorBgContainer: v['--app-surface'],
      colorBgElevated: v['--app-surface-raised'],
      colorText: v['--app-text'],
      colorTextSecondary: v['--app-text-muted'],
      colorTextTertiary: v['--app-text-subtle'],
      colorBorder: v['--app-border'],
      colorBorderSecondary: v['--app-border'],
      controlOutline: withAlpha(p, 0.14),
      borderRadius: 8,
      borderRadiusSM: 6,
      fontSize: 13
    },
    components: {
      Button: {
        defaultHoverColor: p,
        defaultHoverBorderColor: v['--app-primary-hover'],
        defaultActiveColor: v['--app-primary-active'],
        defaultActiveBorderColor: p,
        primaryShadow: `0 2px 0 ${withAlpha(p, 0.1)}`,
        textHoverBg: v['--app-primary-bg-subtle'],
        linkHoverBg: v['--app-primary-bg-subtle']
      },
      Input: {
        hoverBorderColor: v['--app-primary-hover'],
        activeBorderColor: p,
        activeShadow: `0 0 0 2px ${withAlpha(p, 0.12)}`,
        hoverBg: v['--app-primary-bg-subtle'],
        activeBg: v['--app-surface']
      },
      InputNumber: { hoverBorderColor: v['--app-primary-hover'], activeBorderColor: p },
      Select: {
        optionSelectedBg: v['--app-primary-bg'],
        optionActiveBg: v['--app-primary-bg-subtle'],
        multipleItemBg: v['--app-primary-bg'],
        multipleItemBorderColor: v['--app-primary-border'],
        hoverBorderColor: v['--app-primary-hover'],
        activeBorderColor: p,
        activeOutlineColor: withAlpha(p, 0.12)
      },
      Table: {
        headerBg: v['--app-primary-bg-subtle'],
        headerColor: v['--app-text'],
        headerSortActiveBg: v['--app-primary-bg'],
        headerSortHoverBg: v['--app-primary-bg'],
        bodySortBg: v['--app-primary-bg-subtle'],
        rowHoverBg: v['--app-primary-bg-subtle'],
        rowSelectedBg: v['--app-primary-bg'],
        rowSelectedHoverBg: v['--app-primary-bg'],
        rowExpandedBg: v['--app-primary-bg-subtle'],
        borderColor: v['--app-border'],
        headerSplitColor: v['--app-primary-border'],
        footerBg: v['--app-surface-alt'],
        footerColor: v['--app-text-muted']
      },
      Tree: {
        nodeHoverBg: v['--app-primary-bg-subtle'],
        nodeSelectedBg: v['--app-primary-bg'],
        nodeHoverColor: v['--app-primary-text'],
        nodeSelectedColor: v['--app-primary-text']
      },
      Menu: {
        itemHoverBg: v['--app-primary-bg-subtle'],
        itemHoverColor: v['--app-primary-text'],
        itemSelectedBg: v['--app-primary-bg'],
        itemSelectedColor: v['--app-primary-text'],
        itemActiveBg: v['--app-primary-bg']
      },
      Pagination: {
        itemActiveBg: v['--app-primary-bg'],
        itemActiveColor: v['--app-primary-text'],
        itemLinkBg: v['--app-surface']
      },
      Segmented: {
        itemSelectedBg: v['--app-surface-raised'],
        itemSelectedColor: v['--app-primary-text'],
        itemHoverBg: v['--app-primary-bg-subtle'],
        trackBg: v['--app-primary-bg-subtle']
      },
      Tabs: {
        itemHoverColor: v['--app-primary-text'],
        itemActiveColor: v['--app-primary-text'],
        itemSelectedColor: v['--app-primary-text'],
        inkBarColor: p,
        cardBg: v['--app-surface-alt']
      },
      Layout: {
        headerBg: v['--app-surface'],
        bodyBg: v['--app-surface-alt'],
        siderBg: v['--app-primary-bg-subtle'],
        lightSiderBg: v['--app-primary-bg-subtle']
      },
      Progress: { defaultColor: p },
      Slider: { trackBg: p, trackHoverBg: v['--app-primary-hover'], handleColor: p, handleActiveColor: p },
      Radio: {
        buttonSolidCheckedBg: p,
        buttonCheckedBg: v['--app-primary-bg'],
        buttonColor: v['--app-primary-text']
      },
      Checkbox: { colorPrimary: p },
      Switch: { colorPrimary: p },
      Spin: { colorPrimary: p },
      Tag: { defaultBg: v['--app-primary-bg-subtle'], defaultColor: v['--app-primary-text'] },
      Alert: { colorInfoBg: v['--app-primary-bg-subtle'], colorInfoBorder: v['--app-primary-border'] },
      Tooltip: { colorBgSpotlight: dark ? '#2f2f2f' : '#1f1f1f' },
      Modal: { headerBg: v['--app-surface'], contentBg: v['--app-surface'], footerBg: v['--app-surface'] },
      Drawer: { colorBgElevated: v['--app-surface'] }
    }
  }
}
