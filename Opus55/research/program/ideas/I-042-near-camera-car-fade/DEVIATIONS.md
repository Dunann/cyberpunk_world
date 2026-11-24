# I-042 deviations from the spec

The implementation follows part 1 of the I-040 spec (`trafficCars.js` only). Small differences:

1. **Bus box height.** The spec gives the bus box as 1.22 x 0.9 x 5.95 m (half sizes), centred 1.1 m up, so it reaches 2.0 m. The bus mesh's glass house goes up to about 2.77 m (`shape()`: `1.12 + (1.38 - 0.88) * 3.3`). The code uses half sizes 1.22 x 1.25 x 5.95 m, centred 1.5 m up (0.25-2.75 m), so a camera above a bus roof also measures the real distance.
2. **Van box.** The spec scales x by 1.08 and y by 1.18. The code scales the whole box as `shape()` scales the mesh: x 1.08, y 1.18 (half size and centre height), and z 1.04. Half sizes 0.97 x 0.71 x 2.39 m, centred 1.06 m up.
3. **Streak brightness.** The spec says `camFade` multiplies the lamp `vis` and the streak brightness `S.b`. `S.b` is computed from `base`, which already contains `vis`, so multiplying `vis` once fades both the sprites and the streak by `camFade`. Multiplying `S.b` again would fade the streak by `camFade` squared, so it is not done.
4. **Box distance only within 10 m.** `carBoxDist` is computed only for cars whose centre is within 10 m of the camera (the longest box, a bus, reaches about 6.1 m from its centre, plus the 2.5 m band). Every other car has `camFade` = 1, with no extra work.
5. **The run-end scale (`st.fade`) is not applied to the box.** At run ends the mesh shrinks about its centre; the box keeps full size there, which only makes the fade start slightly earlier for a shrinking car.
6. **Where this file lives.** The worktree isolation blocks writes to the main checkout, so this file is committed on `idea/I-042` in the worktree's copy of the program folder.
