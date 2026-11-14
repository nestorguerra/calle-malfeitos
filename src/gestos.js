// Saludar con la mano (docs/pueblo_vivo.md, tarea 14): el brazo derecho sube hacia un lado y el antebrazo va y viene, en
// cualquier esqueleto con nombres de Mixamo (la chica y los vecinos). No es un clip: se pone encima de lo que esté
// haciendo (de pie, andando, sentado), después de la animación, girando cada hueso en el mundo lo que lleva su dirección
// a la que se quiere (así vale para esqueletos con ejes distintos). Dura 2,4 s y entra y sale suave.
import { Quat, Vec3 } from 'playcanvas';

const q1 = new Quat(), a = new Vec3(), b = new Vec3(), eje = new Vec3();
// gira un hueso en el mundo lo que lleva la dirección «desde» a «hacia», en la proporción «peso»
function girarHueso(hueso, desde, hacia, peso) {
  a.copy(desde).normalize(); b.copy(hacia).normalize();
  const ang = Math.acos(Math.max(-1, Math.min(1, a.dot(b)))) * peso;
  if (ang < 1e-4) return;
  eje.cross(a, b); if (eje.lengthSq() < 1e-12) return; eje.normalize();
  q1.setFromAxisAngle(eje, ang * 180 / Math.PI);
  hueso.setRotation(q1.mul(hueso.getRotation()));
}

export function brazoSaludo(cuerpo, lado = 'Right', duracion = 2.4) {
  const brazo = cuerpo?.findByName(`mixamorig:${lado}Arm`), ante = cuerpo?.findByName(`mixamorig:${lado}ForeArm`), mano = cuerpo?.findByName(`mixamorig:${lado}Hand`);
  if (!brazo || !ante || !mano) return null;
  const s = lado === 'Right' ? 1 : -1;
  const fw = new Vec3(), arriba = new Vec3(0, 1, 0), der = new Vec3(), obj = new Vec3(), cur = new Vec3(), t1 = new Vec3();
  let t = -1;
  return {
    empezar() { if (t < 0 || t > 0.6) t = 0; },
    get activo() { return t >= 0; },
    mover(dt) {
      if (t < 0) return;
      t += dt; if (t >= duracion) { t = -1; return; }
      const peso = Math.max(0, Math.min(1, t / 0.35, (duracion - t) / 0.45));
      // el cuerpo: adelante, su +z (los modelos miran a +z); su derecha, adelante × arriba
      cuerpo.getWorldTransform().getZ(fw); fw.y = 0; fw.normalize(); der.cross(fw, arriba).normalize().mulScalar(s);
      // el brazo: hacia fuera y arriba, algo adelantado
      obj.copy(der).mulScalar(0.6).add(t1.copy(arriba).mulScalar(0.72)).add(t1.copy(fw).mulScalar(0.2));
      cur.sub2(ante.getPosition(), brazo.getPosition()); girarHueso(brazo, cur, obj, peso);
      // el antebrazo: casi vertical, y de un lado a otro (dos vaivenes por segundo)
      obj.copy(arriba).add(t1.copy(der).mulScalar(0.18 + 0.32 * Math.sin(t * 12))).add(t1.copy(fw).mulScalar(0.12));
      cur.sub2(mano.getPosition(), ante.getPosition()); girarHueso(ante, cur, obj, peso);
    },
  };
}
