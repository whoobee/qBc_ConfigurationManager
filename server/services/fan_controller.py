"""Case fan controller.

Drives the case fan transistor on GPIO16 HIGH while the service is alive.
Releases the pin on shutdown so the fan stops cleanly.
"""

import logging

from gpiozero import DigitalOutputDevice

logger = logging.getLogger("qBc_ConfigMgr.fan")

FAN_GPIO_PIN = 16


class FanController:
    def __init__(self, pin: int = FAN_GPIO_PIN):
        self._pin = pin
        self._device: DigitalOutputDevice | None = None

    def start(self) -> None:
        if self._device is not None:
            return
        try:
            self._device = DigitalOutputDevice(self._pin, active_high=True, initial_value=True)
            logger.info("Case fan ON (GPIO%d)", self._pin)
        except Exception as e:
            logger.error("Failed to start fan on GPIO%d: %s", self._pin, e)
            self._device = None

    def stop(self) -> None:
        if self._device is None:
            return
        try:
            self._device.off()
            self._device.close()
            logger.info("Case fan OFF (GPIO%d)", self._pin)
        except Exception as e:
            logger.warning("Error stopping fan: %s", e)
        finally:
            self._device = None
