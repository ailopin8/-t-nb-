# Meta Quest 3S · ÀTÚNBÍ controller-first WebXR controls

## Experience requirement

When the user enters immersive VR, the scene shall contain **the sandbox environments and their generated algorithmic patterns**, without a persistent front-facing dashboard. Tool surfaces are transient and belong to the controller interaction, not the simulated universe.

Each sandbox starts as an empty 10 × 10 × 10 coordinate environment. Its boundary remains selectable, including when no algorithm is installed. This is accomplished with a raycast collider that is invisible to the user and does not constitute a simulated object.

## Controller mapping (WebXR)

| Input | Interaction |
| --- | --- |
| Index trigger | Point-and-select sandbox boundary, or click a temporary tool-menu control |
| Grip | Move the entire bounded sandbox-space by physically moving the controller |
| Both grips | Translate, scale and yaw-rotate the shared sandbox-space |
| Left thumbstick | Translate sandboxes sideways and forward/back along the floor |
| Right thumbstick | Rotate sandboxes around vertical axis and continuously scale |
| X (left) or A (right), where available | Show / hide the compact hand-local tool menu |
| Either thumbstick click | Alternate way to toggle the hand-local menu |
| Y (left) or B (right), where available | Back/cancel in the menu |
| Platform/system button | Reserved for Meta Horizon OS and exit controls; never intercepted |

Mappings beyond the required WebXR buttons are device-dependent and feature-detected. In the xr-standard gamepad layout, primary trigger is buttons[0], squeeze buttons[1], thumbstick click buttons[3], thumbstick axes[2:4]. Face buttons, when exposed, generally follow at buttons[4:6]. The system button is not exposed to application code.

### On-demand controller tool palette

The palette is parented to the Three.js **scene**, positioned relative to the left or available tracked controller each animation frame and oriented toward the viewer. It is hidden when VR starts. It is never parented to the sandbox transform group. This removes the previously obstructive fixed front panel.

The palette is a compact ray-selectable 3D menu. Tools include simulation run/pause, stepping, recentering, scaling and rotating; adding an empty sandbox; cycling or installing algorithms; removing an algorithm; choosing an exposed pattern; starting or completing an outer pattern connection; toggling links; and deleting the selected sandbox with confirmation.

An environment can be selected by pointing and pulling the trigger at its invisible boundary collider. There is also a Select next sandbox menu action.

### Manipulating space

The sandbox-space rig transforms independently of headset tracking:
- One grip captures the initial controller position and sandbox rig position. Motion applies the controller displacement to the rig.
- Two grips capture the initial midpoint, hand separation, yaw angle, position and scale. Subsequent poses transform the whole rig using midpoint displacement, separation ratio and planar relative angle.
- Left stick moves the rig relative to the current head-forward horizontal basis.
- Right stick changes yaw and scale.
- Scale is bounded to prevent the environment becoming microscopic or excessively large.
- Recenter places the group around 2.4 m ahead of the horizontal headset forward vector and applies a comfortable initial scale.

In this design, the **environment's visualization is manipulated**; the underlying 10 × 10 × 10 algorithmic simulation state does not change when the user moves, rotates or scales its display.

## Where it is implemented

- `src/spatial-vr-upgrade.ts`: XR controllers, rays, tracked grips, movement, palette and accessible desktop fallbacks.
- `src/spatial-controls.ts`: imports the XR-enhanced spatial implementation.
- `src/editor.ts`: invisible sandbox-boundary colliders and explicit controller-to-sandbox actions.
- `.github/workflows/verify.yml`: TypeScript, unit, build and browser checks.
- `.github/workflows/pages.yml`: optional GitHub Pages publishing, once enabled.

## Test plan on the actual Meta Quest 3S

1. Open the HTTPS website in **Meta Quest Browser** and select Enter VR.
2. Confirm no dashboard occupies the view ahead of the sandboxes.
3. Aim and pull trigger at an empty environment boundary. Confirm selection.
4. Squeeze and hold one grip. Move the tracked hand; confirm the entire sandbox arrangement follows.
5. Hold both grips and widen/separate hands; confirm scale and rotation without camera movement.
6. Use each thumbstick to translate, rotate and scale the environment.
7. Press X/A or thumbstick click to summon the tool palette. Confirm it appears near the hand rather than blocking the world.
8. Trigger-select Add empty sandbox, then install an algorithm. Confirm a pattern appears only after the algorithm is installed.
9. Point-select a second environment; create a pattern connection using menu actions; confirm the receiver's algorithm remains installed.
10. Hide the menu and confirm the immersive environment is visually unobstructed again.
11. Exit VR with Meta system controls and verify the desktop page still responds.

**No claims of actual Quest 3S hardware testing are made in this document.** WebXR support and controller models may vary by browser version and permissions.

## References

- Meta Horizon OS Input: https://developers.meta.com/vr/essentials/horizon-os-input/
- WebXR Gamepads Module: https://www.w3.org/TR/webxr-gamepads-module-1/
- Three.js XRControllerModelFactory: https://threejs.org/docs/pages/XRControllerModelFactory.html

## Publishing

The original AppDeploy URL will retain its previous build until AppDeploy accepts a new deployment. The source is pushed to `main` on GitHub.

An alternate GitHub Pages workflow is also included. In GitHub repository **Settings → Pages → Build and deployment → Source**, select **GitHub Actions**, then run the `Publish ÀTÚNBÍ VR to GitHub Pages` workflow. The workflow builds the Vite website and publishes `dist` if the build and Pages setup succeed.
