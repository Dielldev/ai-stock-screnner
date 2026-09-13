/** Rounded content panel with a microlabel header row, the app's basic building block. */
export default function Panel({ title, action = null, className = "", children }) {
  return (
    <section
      className={`panel p-5 shadow-[0_24px_48px_-36px_rgba(63,99,201,0.4)] ${className}`}
    >
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="microlabel">{title}</p>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
