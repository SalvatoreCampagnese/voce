/**
 * @voce/ui — primitive del design system istituzionale.
 *
 * Qui stanno solo componenti che NON dipendono da Next.js, così restano
 * riutilizzabili da un'altra istanza di VOCE. Header, footer e navigazione
 * vivono in apps/web/components/istituzionale perché usano next/link.
 */
export { cn } from './lib/cn'

export { Tricolore } from './components/Tricolore'
export { Bottone, bottoneVarianti, type BottoneProps } from './components/Bottone'
export { CardIstituzionale } from './components/CardIstituzionale'
export { TagStato, type StatoTag } from './components/TagStato'
export { CalloutAvviso } from './components/CalloutAvviso'
export { Breadcrumb, type VoceBreadcrumb } from './components/Breadcrumb'
export { CampoModulo } from './components/Modulo'
export { BarraProgresso } from './components/BarraProgresso'
export { Numero } from './components/Numero'
