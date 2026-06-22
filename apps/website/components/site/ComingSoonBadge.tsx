// "Em breve" badge (README §Badge). Items carrying it are NOT links — render
// as disabled text + badge so we never promise pages that don't exist.
export function ComingSoonBadge() {
  return (
    <span className="rounded-pill bg-pink-200 px-[7px] py-[2px] text-[9.5px] font-extrabold text-cherry-dark">
      Em breve
    </span>
  );
}
