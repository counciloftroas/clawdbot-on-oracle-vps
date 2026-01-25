# clawdbot-oracle-vps

Deploy an Oracle Cloud Always Free ARM instance with Clawdbot and optional Tailscale using Pulumi.

## Overview

This project provisions:

- **Oracle Cloud ARM Instance** (VM.Standard.A1.Flex) - 4 OCPUs, 24GB RAM
- **Ubuntu 22.04 LTS** with automatic security updates
- **Clawdbot** - Claude-powered automation agent
- **Tailscale** - Private mesh networking

All resources stay within Oracle's Always Free tier limits.

## Guide

The [blog post](abrown.blog/posts/personal-assistant-clawdbot-on-oracle-cloud) has a full write up on everything you need to do.
