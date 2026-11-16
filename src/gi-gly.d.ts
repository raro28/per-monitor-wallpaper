// Glycin (gi://Gly) ships no TypeScript bindings; declare the surface we import.
declare module 'gi://Gly' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Glycin: any;
  export default Glycin;
}
