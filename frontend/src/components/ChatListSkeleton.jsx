export default function ChatListSkeleton() {
  return (
    <div className="chat-list-skeleton">
      {[0, 1, 2, 3, 4].map((i) => (
        <div className="skeleton-row" key={i}>
          <div className="skeleton-avatar" />
          <div className="skeleton-lines">
            <div className="skeleton-line short" />
            <div className="skeleton-line" />
          </div>
        </div>
      ))}
    </div>
  );
}
