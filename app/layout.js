import WorkJumpscare from './WorkJumpscare';
import { SocialCreditProvider } from './SocialCreditContext';
import SesionApodo from './SesionApodo';

export const metadata = {
  title: 'Cargando pelada...',
  description: 'Pela loading...',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#000' }}>
        <SocialCreditProvider>
          <WorkJumpscare />
          <SesionApodo />
          {children}
        </SocialCreditProvider>
      </body>
    </html>
  )
}
