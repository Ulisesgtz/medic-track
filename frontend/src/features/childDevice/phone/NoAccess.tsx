import { PHONE } from '../childText'

/** What the child's phone shows when it has no working access: no data of the child, only what to do (ask the parent for a new one). */
export function NoAccess({ message = PHONE.noAccess }: { message?: string }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col justify-center gap-3 bg-canvas px-6 py-10">
      <h1 className="text-2xl leading-[1.2] font-black tracking-[-0.02em] text-ink">PediTrack</h1>
      <p role="status" className="text-[17px] leading-relaxed text-body">
        {message}
      </p>
    </main>
  )
}
