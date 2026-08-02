import { HeaderIstituzionale } from '@/components/istituzionale/HeaderIstituzionale'
import { FooterIstituzionale } from '@/components/istituzionale/FooterIstituzionale'

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <HeaderIstituzionale />
      <main id="contenuto-principale" className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        {children}
      </main>
      <FooterIstituzionale />
    </>
  )
}
