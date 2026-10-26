import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const download = vi.hoisted(() => vi.fn());
vi.mock('../../src/features/chat/chatMediaClient', () => ({ downloadChatMedia: download }));
vi.mock('../../src/features/chat/chatImageDisplay', () => ({
  rasterizeChatImage: async (blob: Blob) => blob,
}));
import { ChatMedia } from '../../src/features/bookings/components/booking_chat/ChatMedia';
beforeEach(() => {
  download.mockReset().mockResolvedValue(new Blob(['image'], { type: 'image/jpeg' }));
  URL.createObjectURL = vi.fn().mockReturnValue('blob:private-media');
  URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);
it('does not expose an SVG Blob mislabeled as a video attachment', async () => {
  download.mockResolvedValue(new Blob(['<svg/>'], { type: 'image/svg+xml' }));
  const view = render(<ChatMedia value="chat-media:chat/booking/svg" type="video" name="Video" />);
  fireEvent.click(screen.getByRole('button', { name: 'Video' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Video' })).toHaveTextContent('↻'));
  expect(view.container.querySelector('video')).toBeNull();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
it('opens gallery images in a passive viewer and releases their Blob URL on close', async () => {
  const viewer = { opener: window, document: document.implementation.createHTMLDocument() };
  const open = vi.spyOn(window, 'open').mockReturnValue(viewer as unknown as Window);
  const view = render(
    <ChatMedia
      value="https://firebasestorage.googleapis.com/old?token=secret"
      type="image"
      name="Photo"
      openImage
    />
  );
  const image = await screen.findByRole('img');
  const button = screen.getByRole('button', { name: 'Photo' });
  expect(image).toHaveAttribute('src', 'blob:private-media');
  expect(screen.queryByRole('link')).toBeNull();
  fireEvent.click(button);
  expect(open).toHaveBeenCalledWith('about:blank', '_blank');
  expect(viewer.opener).toBeNull();
  expect(viewer.document.querySelector('img')?.getAttribute('src')).toBe('blob:private-media');
  open.mockRestore();
  view.unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:private-media');
});
it('releases the previous attachment URL on replacement', async () => {
  const view = render(
    <ChatMedia value="chat-media:chat/booking/first.jpg" type="image" name="Photo" />
  );
  await screen.findByRole('img');
  const firstSignal = download.mock.calls[0][1] as AbortSignal;
  view.rerender(<ChatMedia value="chat-media:chat/booking/second.jpg" type="image" name="Photo" />);
  await waitFor(() => expect(download).toHaveBeenCalledTimes(2));
  expect(firstSignal.aborted).toBe(true);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:private-media');
});

it('retries through the authorized downloader after an error', async () => {
  download.mockRejectedValueOnce(new Error('403'));
  render(<ChatMedia value="chat-media:chat/booking/retry.jpg" type="image" name="Photo" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Photo' }));
  await screen.findByRole('img');
  expect(download).toHaveBeenCalledTimes(2);
});

it('renders images only from an authenticated Blob, then releases the URL and aborts on close', async () => {
  const view = render(
    <ChatMedia value="chat-media:chat/booking/photo.jpg" type="image" name="Photo" />
  );
  const image = await screen.findByRole('img');
  expect(image).toHaveAttribute('src', 'blob:private-media');
  const signal = download.mock.calls[0][1] as AbortSignal;
  view.unmount();
  expect(signal.aborted).toBe(true);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:private-media');
});
it('loads video on demand and preserves native video controls and seeking through a local Blob', async () => {
  download.mockResolvedValue(new Blob(['video'], { type: 'video/webm' }));
  const view = render(
    <ChatMedia value="chat-media:chat/booking/video.mp4" type="video" name="Video" />
  );
  expect(download).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button'));
  await waitFor(() =>
    expect(view.container.querySelector('video')).toHaveAttribute('src', 'blob:private-media')
  );
  expect(view.container.querySelector('video')).toHaveAttribute('controls');
  expect(download).toHaveBeenCalledTimes(1);
});
it('does not fall back to a historical public token URL when authorization fails', async () => {
  download.mockRejectedValue(new Error('403'));
  const view = render(
    <ChatMedia
      value="https://firebasestorage.googleapis.com/old?token=secret"
      type="image"
      name="Photo"
    />
  );
  await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
  expect(view.container.querySelector('img')).toBeNull();
});
