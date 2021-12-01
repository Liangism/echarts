/*
* Licensed to the Apache Software Foundation (ASF) under one
* or more contributor license agreements.  See the NOTICE file
* distributed with this work for additional information
* regarding copyright ownership.  The ASF licenses this file
* to you under the Apache License, Version 2.0 (the
* "License"); you may not use this file except in compliance
* with the License.  You may obtain a copy of the License at
*
*   http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing,
* software distributed under the License is distributed on an
* "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
* KIND, either express or implied.  See the License for the
* specific language governing permissions and limitations
* under the License.
*/

import { AnimationEasing } from 'zrender/src/animation/easing';
import Element from 'zrender/src/Element';
import { keys, filter, each } from 'zrender/src/core/util';
import { ELEMENT_ANIMATABLE_PROPS } from './customGraphicTransition';
import { AnimationOption, AnimationOptionMixin, Dictionary } from '../util/types';
import { Model } from '../echarts.all';
import { getAnimationConfig } from './basicTrasition';
import { warn } from '../util/log';
import { makeInner } from '../util/model';

// Helpers for creating keyframe based animations in custom series and graphic components.

type AnimationKeyframe<T extends Record<string, any>> = T & {
    easing?: AnimationEasing
    percent?: number    // 0 - 1
};

type StateToRestore = Dictionary<any>;
const getStateToRestore = makeInner<StateToRestore, Element>();

export interface ElementKeyframeAnimationOption<Props extends Record<string, any>> extends AnimationOption {
    // Animation configuration for keyframe based animation.
    loop?: boolean
    keyframes?: AnimationKeyframe<Props>[]
}

/**
 * Stopped previous keyframe animation and restore the attributes.
 * Avoid new keyframe animation starts with wrong internal state when the percent: 0 is not set.
 */
export function stopPreviousKeyframeAnimationAndRestore(el: Element) {
    // Stop previous keyframe animation.
    el.stopAnimation('keyframe');
    // Restore
    el.attr(getStateToRestore(el));
}

export function applyKeyframeAnimation<T extends Record<string, any>>(
    el: Element,
    animationOpts: ElementKeyframeAnimationOption<T>,
    animatableModel: Model<AnimationOptionMixin>
) {
    if (!animatableModel.isAnimationEnabled()) {
        return;
    }

    const keyframes = animationOpts.keyframes;
    let duration = animationOpts.duration;

    if (animatableModel && duration == null) {
        const config = getAnimationConfig('enter', animatableModel, 0);
        duration = config && config.duration;
    }

    if (!keyframes || !duration) {
        return;
    }

    const stateToRestore: StateToRestore = getStateToRestore(el);

    function applyKeyframeAnimationOnProp(targetPropName: typeof ELEMENT_ANIMATABLE_PROPS[number]) {
        if (targetPropName && !(el as any)[targetPropName]) {
            return;
        }

        let animator: ReturnType<Element['animate']>;
        let endFrameIsSet = false;
        each(keyframes, kf => {
            // Stop current animation.
            const animators = el.animators;
            const kfValues = targetPropName ? kf[targetPropName] : kf;
            if (!kfValues) {
                return;
            }

            let propKeys = keys(kfValues);
            if (!targetPropName) {
                // PENDING performance?
                propKeys = filter(
                    propKeys, key => key !== 'percent' && key !== 'easing'
                    && key !== 'shape' && key !== 'style' && key !== 'extra'
                );
            }
            if (!propKeys.length) {
                return;
            }

            if (__DEV__) {
                if (kf.percent >= 1) {
                    endFrameIsSet = true;
                }
            }

            if (!animator) {
                animator = el.animate(targetPropName, animationOpts.loop);
                animator.scope = 'keyframe';
            }
            for (let i = 0; i < animators.length; i++) {
                // Stop all other animation that is not keyframe.
                if (animators[i] !== animator && animators[i].targetName === animator.targetName) {
                    animators[i].stopTracks(propKeys);
                }
            }

            targetPropName && (stateToRestore[targetPropName] = stateToRestore[targetPropName] || {});

            const savedTarget = targetPropName ? stateToRestore[targetPropName] : stateToRestore;
            each(propKeys, key => {
                // Save original value.
                savedTarget[key] = ((targetPropName ? (el as any)[targetPropName] : el) || {})[key];
            });

            animator.whenWithKeys(duration * kf.percent, kfValues, propKeys, kf.easing);
        });
        if (!animator) {
            return;
        }

        if (__DEV__) {
            if (!endFrameIsSet) {
                warn('End frame with percent: 1 is missing in the keyframeAnimation.', true);
            }
        }

        animator
            .delay(animationOpts.delay || 0)
            .start(animationOpts.easing);
    }

    each(ELEMENT_ANIMATABLE_PROPS, applyKeyframeAnimationOnProp);
}