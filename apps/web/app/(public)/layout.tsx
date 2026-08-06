import { HeaderIstituzionale } from '@/components/istituzionale/HeaderIstituzionale'
import { FooterIstituzionale } from '@/components/istituzionale/FooterIstituzionale'

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <HeaderIstituzionale />
      {/* tabIndex={-1}: senza, dopo il salto al contenuto diversi browser
          spostano solo lo scorrimento e lasciano il focus sul link. Il tasto
          successivo riporterebbe dentro il menu appena saltato. Non entra nel
          giro di tabulazione: -1 rende l'elemento focusabile solo da codice. */}
      <main
        id="contenuto-principale"
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl flex-1 px-6 py-10"
      >
        {children}
      </main>
      <FooterIstituzionale />
    </>
  )
}
