# ORKAI — Master Planning Prompt
## Open Source AI Workspace for Windows

> **Mission**
>
> Build **Orkai**, an open-source, Windows-first visual operating system for AI agents.
>
> Orkai is **not** a terminal emulator.
> It is **not** an IDE.
> It is **not** a Claude Code wrapper.
>
> It is an orchestration platform where humans and AI agents collaborate inside a persistent visual workspace.

---

# Vision

Imagine if:

- Figma
- Obsidian
- VSCode
- tmux
- Claude Code
- Docker Desktop
- Raycast
- Miro

were merged into one application designed specifically for AI software development.

That is Orkai.

---

# Primary Goals

The application must:

- be completely Open Source
- run natively on Windows
- later support Linux and macOS
- leverage GPU acceleration
- support thousands of nodes on screen
- be plugin-first
- support any AI agent
- work offline whenever possible
- never require cloud synchronization
- keep user data local

---

# Core Philosophy

Everything is a node.

Every node can connect to another node.

Everything is visual.

Everything is persistent.

Everything is scriptable.

Everything is extensible.

---

# Design Principles

## Visual First

Users should understand their project simply by looking at the workspace.

No hidden state.

No invisible tabs.

No magic.

---

## Agent First

Humans are supervisors.

Agents perform work.

The software coordinates.

---

## Local First

Projects live locally.

Markdown is Markdown.

Files remain files.

Git remains Git.

Nothing is locked inside proprietary formats.

---

## Open Ecosystem

Every feature should be accessible through:

- plugins
- APIs
- IPC
- scripting
- extensions

---

# Target Users

- AI Developers
- Software Engineers
- Technical Leads
- OSS Contributors
- Researchers
- Prompt Engineers
- Architects

---

# Recommended Technology Stack

## Language

Rust

Reason:

- memory safety
- performance
- native
- async
- ecosystem
- portability

---

## UI

Rust + Tauri v2

Frontend:

React

TypeScript

---

## Rendering

GPU accelerated.

Preferred:

wgpu

Backend:

DirectX 12

Fallback:

Vulkan

Future:

Metal

OpenGL only as fallback.

Never CPU-render the canvas.

---

## Canvas Engine

Infinite GPU canvas.

Features:

- pan
- zoom
- node virtualization
- smooth animation
- selection
- grouping
- minimap

Target:

60~144 FPS

Even with:

500+

terminals

notes

connections

---

## Terminal

Use:

xterm.js

Backend:

ConPTY

Native Windows pseudo terminal.

Requirements:

- ANSI
- UTF8
- colors
- alternate buffer
- TUI support
- Vim
- Lazygit
- btop
- Claude Code
- Codex
- Aider

Must behave exactly like Windows Terminal.

---

## Local Database

SQLite

Using:

libSQL

or

SQLite + sqlx

---

## Search

Tantivy

Full text indexing.

Search:

files

notes

agents

logs

workspace

---

## Markdown

Markdown AST

Support:

- Mermaid
- Math
- Code Highlight
- Tables
- Callouts
- Images
- Attachments

---

## Filesystem Watching

notify crate

Realtime.

---

## Async Runtime

Tokio

---

## Serialization

Serde

---

## IPC

Tauri IPC

+

gRPC optional

---

## Plugin SDK

Rust

TypeScript

Python

Plugins may expose:

commands

nodes

panels

toolbars

AI providers

automations

---

# Workspace

Workspace stores:

Canvas

Zoom

Folders

Nodes

Connections

Agent history

Notes

Environment

Preferences

Window layouts

Everything restores after restart.

---

# Canvas

Infinite.

GPU accelerated.

Capabilities:

pan

zoom

snap

grid

align

guides

group

frames

folders

locking

layers

color tags

bookmarks

comments

history

undo

redo

---

# Node Types

## Terminal

Interactive shell.

---

## AI Agent

Claude

Codex

Gemini CLI

OpenCode

Aider

Cursor CLI

Custom CLI

---

## Markdown Note

Live markdown.

---

## Whiteboard

Drawing.

---

## Browser

Embedded Chromium.

Automation ready.

---

## File Tree

Explorer.

---

## Folder

Grouping.

---

## Image

---

## PDF

---

## Mermaid Diagram

Live rendered.

---

## Database Explorer

SQLite

Postgres

MySQL

SQL Server

Mongo

Redis

---

## Logs

Realtime.

---

## Git

Visual git status.

---

## Diff Viewer

---

## Prompt Library

---

## Flow Node

Automation.

---

## REST Client

---

## MCP Server

---

## MCP Client

---

## Custom Plugin Node

---

# Connections

Every node may connect.

Terminal -> Terminal

Agent -> Agent

Agent -> Browser

Agent -> Notes

Browser -> Notes

Git -> Agent

Database -> Agent

Everything should be graph based.

---

# AI Agent System

Each agent has:

name

role

system prompt

provider

model

memory

working directory

tools

permissions

history

cost

runtime

status

---

# Agent Roles

Examples:

Architect

Reviewer

Security

Backend

Frontend

DevOps

QA

Database

Performance

Documentation

Researcher

Tech Lead

PM

Bug Hunter

---

# Multi-Agent Collaboration

Agents communicate.

Delegate.

Review.

Merge.

Vote.

Escalate.

Broadcast.

Ping.

Share context.

Share files.

Share notes.

---

# Maestro Mode

One orchestrator.

Multiple workers.

Planner delegates.

Workers execute.

Reviewer validates.

Architect approves.

---

# Agent Memory

Short-term

Long-term

Project

Global

Session

Embeddings optional.

---

# Browser Automation

Embedded Chromium.

Agents can:

navigate

click

fill

download

upload

capture screenshots

extract HTML

inspect DOM

record workflows

---

# Docker Integration

Detect:

Docker Desktop

Podman

WSL

Rancher Desktop

Support:

container terminals

container logs

compose

exec

stats

---

# SSH

Multiple sessions.

Saved hosts.

Key management.

---

# Git

Visual graph.

Branches.

Cherry-pick.

Rebase.

PR helper.

Conflict resolution.

---

# AI Providers

Native support.

OpenAI

Anthropic

Google

OpenRouter

Ollama

LM Studio

vLLM

Azure

Bedrock

Mistral

Groq

Custom OpenAI compatible APIs

---

# MCP

First-class citizen.

Visual MCP inspector.

Tool explorer.

Live resources.

Prompt testing.

Server management.

---

# Automations

Cron.

File changes.

Git commits.

Build completed.

Tests failed.

Webhook.

Custom triggers.

---

# Prompt Library

Versioned.

Shared.

Categorized.

Searchable.

Variables.

Templates.

---

# Knowledge Base

Markdown

PDF

Images

Repositories

Documentation

Indexed locally.

---

# Search Everywhere

CTRL+K

Search:

files

agents

notes

commands

plugins

workspace

logs

history

---

# Notifications

Native Windows notifications.

Agent finished.

Review needed.

Error.

Cost exceeded.

---

# Cost Dashboard

Track:

tokens

provider

daily

monthly

per project

per agent

---

# Performance Dashboard

CPU

GPU

RAM

Disk

Network

Token usage

---

# Plugin Marketplace

Community plugins.

One-click install.

GitHub based.

No central server required.

---

# Security

Sandbox plugins.

Permission model.

Filesystem permissions.

Network permissions.

Secrets manager.

---

# GPU

Everything rendered through GPU.

Canvas.

Animations.

Zoom.

Connections.

Effects.

Large workspaces.

Target:

1000+

visible nodes

without lag.

---

# Nice-to-have Features Beyond Maestri

## Voice Agents

Talk to agents.

---

## Local Speech-to-Text

Whisper.

---

## Local Text-to-Speech

---

## Live Screen Understanding

Agents inspect your desktop.

---

## OCR

---

## Recording Sessions

Replay work.

---

## Timeline

Entire project history.

---

## Branch Workspaces

Workspace linked to Git branches.

---

## Workspace Templates

Backend

Frontend

Microservices

Research

---

## AI Flow Builder

Node-based workflow editor.

---

## Multi-monitor awareness

---

## Floating widgets

---

## Mobile companion

Notifications only.

---

## Live Collaboration (optional)

Peer-to-peer.

No cloud dependency.

---

## Plugin SDK Documentation Generator

---

## Built-in Benchmark Suite

---

## Crash Recovery

Autosave.

---

## Session Replay

---

## Visual Agent Debugger

See every prompt.

Every response.

Every tool call.

---

# Architecture

Use clean architecture.

Domain-driven.

Feature modules.

No god objects.

Strict boundaries.

Dependency inversion.

Unit tests.

Integration tests.

Snapshot tests.

CI/CD.

---

# Repository Structure

/apps

/core

/crates

/plugins

/sdk

/docs

/examples

/tools

/tests

/assets

---

# Documentation

Every public module documented.

Architecture Decision Records.

RFC process.

Contribution guide.

Plugin guide.

SDK guide.

---

# Development Quality

No shortcuts.

No hacks.

No dead code.

Strong typing.

Benchmarks.

Profiling.

Accessibility.

Keyboard-first UX.

High DPI support.

Dark mode.

Light mode.

Internationalization.

---

# Success Criteria

Orkai should become the best open-source desktop environment for AI agent orchestration on Windows.

Users should be able to manage dozens of AI agents visually, automate complex development workflows, collaborate with local and remote environments, and extend the platform through plugins—all while maintaining native performance, local-first principles, and complete ownership of their data.